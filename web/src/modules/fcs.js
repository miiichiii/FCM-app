export function parseFcsHeader(buffer) {
  const textDecoder = new TextDecoder("ascii");
  // Ensure we have enough bytes
  if (buffer.byteLength < 58) throw new Error("File too short to be FCS");
  
  const headerBytes = new Uint8Array(buffer, 0, 58);
  const headerStr = textDecoder.decode(headerBytes);
  
  const version = headerStr.slice(0, 6).trim();
  const textStart = parseInt(headerStr.slice(10, 18).trim(), 10);
  const textEnd = parseInt(headerStr.slice(18, 26).trim(), 10);
  const dataStart = parseInt(headerStr.slice(26, 34).trim(), 10);
  const dataEnd = parseInt(headerStr.slice(34, 42).trim(), 10);
  
  return { version, textStart, textEnd, dataStart, dataEnd };
}

export function parseFcsTextSegment(buffer, textStart, textEnd) {
  // Safe slice
  if (textStart >= buffer.byteLength || textEnd >= buffer.byteLength) {
    throw new Error("Text segment out of bounds");
  }
  const textDecoder = new TextDecoder("utf-8"); // Try UTF-8, fallback usually works for ASCII
  const textBytes = new Uint8Array(buffer, textStart, textEnd - textStart + 1);
  const textStr = textDecoder.decode(textBytes);

  const delimiter = textStr[0];
  const parts = textStr.split(delimiter);
  const keywords = new Map();

  for (let i = 1; i < parts.length - 1; i += 2) {
    const key = parts[i].toUpperCase();
    const val = parts[i + 1];
    keywords.set(key, val);
  }

  return keywords;
}

function parseFcsText(buffer, textStart, textEnd) {
  const keywords = parseFcsTextSegment(buffer, textStart, textEnd);
  return Object.fromEntries(keywords);
}

export async function parseFcsFile(buffer) {
  const header = parseFcsHeader(buffer);
  const keywords = parseFcsTextSegment(buffer, header.textStart, header.textEnd);

  let dataStart = header.dataStart;
  let dataEnd = header.dataEnd;

  if (dataStart === 0 && keywords.get("$BEGINDATA")) {
    dataStart = parseInt(keywords.get("$BEGINDATA"), 10);
  }
  if (dataEnd === 0 && keywords.get("$ENDDATA")) {
    dataEnd = parseInt(keywords.get("$ENDDATA"), 10);
  }

  const par = parseInt(keywords.get("$PAR"), 10);
  const tot = parseInt(keywords.get("$TOT"), 10);
  const datatype = keywords.get("$DATATYPE") || "I";
  const byteord = keywords.get("$BYTEORD");

  // FCS standard: "1,2,3,4" is Big Endian, "4,3,2,1" is Little Endian.
  const isLittleEndian = byteord === "4,3,2,1";

  const params = [];

  for (let i = 1; i <= par; i++) {
    const name = keywords.get(`$P${i}N`) || `Param ${i}`;
    const label = keywords.get(`$P${i}S`) || name;
    const bits = parseInt(keywords.get(`$P${i}B`), 10);
    const range = parseFloat(keywords.get(`$P${i}R`));
    params.push({ index: i - 1, name, label, bits, range });
  }

  const dataView = new DataView(buffer);

  const paramReaders = params.map((p) => {
    return createReader(dataView, datatype, p.bits, isLittleEndian);
  });
  const bytesPerParam = params.map((p) => {
    return getBytesPerParam(datatype, p.bits);
  });
  const bytesPerEvent = bytesPerParam.reduce((a, b) => a + b, 0);

  // Preview
  const PREVIEW_LIMIT = 2000;
  const nPreview = Math.min(tot, PREVIEW_LIMIT);
  const stride = Math.floor(tot / nPreview) || 1;

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

function getBytesPerParam(dataType, bits) {
  switch (dataType) {
    case "F":
      return 4;
    case "D":
      return 8;
    case "I": {
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
      if (bits <= 8) return (offset) => dataView.getUint8(offset);
      if (bits <= 16) return (offset) => dataView.getUint16(offset, littleEndian);
      if (bits <= 32) return (offset) => dataView.getUint32(offset, littleEndian);
      throw new Error(`Unsupported bit depth for integer: ${bits}`);
    }
    default:
      throw new Error(`Unsupported datatype: ${dataType}`);
  }
}

