import { parseFcsByteOrder, resolveFcsEndian } from "./fcsEndian.js";

export function parseFcsHeader(buffer) {
  if (buffer.byteLength < 58) throw new Error("File too short to be FCS");

  const headerBytes = new Uint8Array(buffer, 0, 58);
  const headerStr = decodeLatin1(headerBytes);

  const version = headerStr.slice(0, 6).trim();
  const textStart = parseInt(headerStr.slice(10, 18).trim(), 10);
  const textEnd = parseInt(headerStr.slice(18, 26).trim(), 10);
  const dataStart = parseInt(headerStr.slice(26, 34).trim(), 10);
  const dataEnd = parseInt(headerStr.slice(34, 42).trim(), 10);

  return { version, textStart, textEnd, dataStart, dataEnd };
}

export function parseFcsTextSegment(buffer, textStart, textEnd) {
  if (
    !Number.isFinite(textStart) ||
    !Number.isFinite(textEnd) ||
    textStart < 0 ||
    textEnd < textStart ||
    textEnd >= buffer.byteLength
  ) {
    throw new Error("Text segment out of bounds");
  }

  const textBytes = new Uint8Array(buffer, textStart, textEnd - textStart + 1);
  const textStr = decodeLatin1(textBytes);
  if (textStr.length === 0) throw new Error("Empty FCS TEXT segment");

  const delimiter = textStr[0];
  const tokens = parseDelimitedTokens(textStr, delimiter);
  const keywords = new Map();

  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const key = tokens[i].toUpperCase();
    const val = tokens[i + 1];
    keywords.set(key, val);
  }

  return keywords;
}

export async function parseFcsFile(buffer) {
  const header = parseFcsHeader(buffer);
  const keywords = parseFcsTextSegment(buffer, header.textStart, header.textEnd);

  const textDataStart = parsePositiveInt(keywords.get("$BEGINDATA"));
  const textDataEnd = parsePositiveInt(keywords.get("$ENDDATA"));
  let dataStart = textDataStart ?? parsePositiveInt(header.dataStart);
  let dataEnd = textDataEnd ?? parsePositiveInt(header.dataEnd);

  const par = parseInt(keywords.get("$PAR") ?? "", 10);
  if (!Number.isFinite(par) || par <= 0) {
    throw new Error("Invalid or missing $PAR in FCS TEXT segment");
  }

  let tot = parseInt(keywords.get("$TOT") ?? "", 10);
  if (!Number.isFinite(tot) || tot < 0) {
    throw new Error("Invalid or missing $TOT in FCS TEXT segment");
  }

  const datatype = (keywords.get("$DATATYPE") || "I").toUpperCase();
  const byteord = keywords.get("$BYTEORD");

  const params = [];

  for (let i = 1; i <= par; i++) {
    const name = keywords.get(`$P${i}N`) || `Param ${i}`;
    const label = keywords.get(`$P${i}S`) || name;
    const bits = parseInt(keywords.get(`$P${i}B`) ?? "", 10);
    const range = parseFloat(keywords.get(`$P${i}R`) ?? "");
    params.push({ index: i - 1, name, label, bits, range });
  }

  const bytesPerParam = params.map((p) => getBytesPerParam(datatype, p.bits));
  const bytesPerEvent = bytesPerParam.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(bytesPerEvent) || bytesPerEvent <= 0) {
    throw new Error("Failed to determine bytes/event from FCS metadata");
  }

  if (dataStart == null) {
    if (tot === 0) {
      return makeEmptyDataset(header.version, params, keywords);
    }
    dataStart = guessDataStartAfterText(header.textEnd, buffer.byteLength, bytesPerEvent, tot);
    if (dataStart == null) {
      throw new Error("Missing DATA offsets in FCS ($BEGINDATA/$ENDDATA) and failed to infer position");
    }
  }

  if (dataEnd == null || dataEnd < dataStart) {
    if (tot > 0 && dataStart + tot * bytesPerEvent <= buffer.byteLength) {
      dataEnd = dataStart + tot * bytesPerEvent - 1;
    } else {
      dataEnd = buffer.byteLength - 1;
    }
  }

  const availableBytes = Math.max(0, Math.min(buffer.byteLength - dataStart, dataEnd - dataStart + 1));
  const availableEvents = Math.floor(availableBytes / bytesPerEvent);

  if (tot === 0) tot = availableEvents;
  if (tot > availableEvents) tot = availableEvents;

  if (tot <= 0) {
    return makeEmptyDataset(header.version, params, keywords);
  }

  const dataView = new DataView(buffer);
  const declaredLittleEndian = parseFcsByteOrder(byteord);
  const isLittleEndian = resolveFcsEndian({
    dataView,
    dataStart,
    bufferByteLength: buffer.byteLength,
    dataType: datatype,
    bytesPerParam,
    paramRanges: params.map((p) => p.range),
    nEvents: tot,
    bytesPerEvent,
    declaredLittleEndian,
  });

  const paramReaders = params.map((p) => createReader(dataView, datatype, p.bits, isLittleEndian));

  const PREVIEW_LIMIT = 2000;
  const nPreview = Math.min(tot, PREVIEW_LIMIT);
  const stride = nPreview > 0 ? Math.floor(tot / nPreview) || 1 : 1;

  const TArray = datatype === "D" ? Float64Array : Float32Array;
  const channelData = params.map(() => new TArray(nPreview));

  for (let i = 0; i < nPreview; i++) {
    const eventIndex = i * stride;
    const eventOffset = dataStart + eventIndex * bytesPerEvent;

    if (eventOffset + bytesPerEvent > buffer.byteLength) break;

    let offsetInEvent = 0;
    for (let p = 0; p < par; p++) {
      channelData[p][i] = paramReaders[p](eventOffset + offsetInEvent);
      offsetInEvent += bytesPerParam[p];
    }
  }

  return {
    version: header.version,
    nEvents: tot,
    params,
    spill: keywords.get("$SPILLOVER") || keywords.get("$SPILL"),
    preview: {
      n: nPreview,
      channels: channelData,
    },
  };
}

function makeEmptyDataset(version, params, keywords) {
  return {
    version,
    nEvents: 0,
    params,
    spill: keywords.get("$SPILLOVER") || keywords.get("$SPILL"),
    preview: {
      n: 0,
      channels: params.map(() => new Float32Array(0)),
    },
  };
}

function getBytesPerParam(dataType, bits) {
  switch (dataType) {
    case "F":
      return 4;
    case "D":
      return 8;
    case "I": {
      if (!Number.isFinite(bits)) return 2;
      if (bits <= 8) return 1;
      if (bits <= 16) return 2;
      if (bits <= 32) return 4;
      throw new Error(`Unsupported bit depth for integer: ${bits}`);
    }
    default:
      throw new Error(`Unsupported datatype: ${dataType}`);
  }
}

function createReader(dataView, dataType, bits, littleEndian) {
  switch (dataType) {
    case "F":
      return (offset) => dataView.getFloat32(offset, littleEndian);
    case "D":
      return (offset) => dataView.getFloat64(offset, littleEndian);
    case "I": {
      if (!Number.isFinite(bits) || bits <= 16) {
        if (bits <= 8) return (offset) => dataView.getUint8(offset);
        return (offset) => dataView.getUint16(offset, littleEndian);
      }
      if (bits <= 32) return (offset) => dataView.getUint32(offset, littleEndian);
      throw new Error(`Unsupported bit depth for integer: ${bits}`);
    }
    default:
      throw new Error(`Unsupported datatype: ${dataType}`);
  }
}

function decodeLatin1(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function parseDelimitedTokens(text, delimiter) {
  const tokens = [];
  let i = 1; // first byte is delimiter in FCS TEXT segment
  let token = "";

  while (i < text.length) {
    const ch = text[i];
    if (ch === delimiter) {
      if (i + 1 < text.length && text[i + 1] === delimiter) {
        token += delimiter;
        i += 2;
        continue;
      }
      tokens.push(token);
      token = "";
      i += 1;
      continue;
    }
    token += ch;
    i += 1;
  }

  if (token.length > 0) tokens.push(token);
  return tokens;
}

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function guessDataStartAfterText(textEnd, byteLength, bytesPerEvent, nEvents) {
  const rawStart = Number.isFinite(textEnd) ? textEnd + 1 : null;
  if (!Number.isFinite(rawStart) || rawStart < 0 || rawStart >= byteLength) return null;

  const candidates = [
    rawStart,
    alignUp(rawStart, 64),
    alignUp(rawStart, 128),
    alignUp(rawStart, 256),
  ];

  for (const start of candidates) {
    if (start + nEvents * bytesPerEvent <= byteLength) return start;
  }
  return null;
}

function alignUp(n, step) {
  return Math.ceil(n / step) * step;
}
