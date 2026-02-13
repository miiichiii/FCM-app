// Minimal FCS (3.0/3.1-ish) parser for MVP import + preview sampling.
//
// Outputs a preview-only dataset: Float32Array per parameter (length <= 10k).
// Full-resolution storage + worker pipelines are planned for later iterations.

export async function parseFcsFile(arrayBuffer) {
  const header = parseFcsHeader(arrayBuffer);
  const text = parseFcsTextSegment(arrayBuffer, header.textStart, header.textEnd);

  const nEvents = parseInt(text.get("$TOT") ?? "", 10);
  const nParams = parseInt(text.get("$PAR") ?? "", 10);
  if (!Number.isFinite(nEvents) || nEvents <= 0) throw new Error("Invalid $TOT in FCS TEXT segment");
  if (!Number.isFinite(nParams) || nParams <= 0) throw new Error("Invalid $PAR in FCS TEXT segment");

  const dataStart = parseInt(text.get("$BEGINDATA") ?? "", 10) || header.dataStart;
  const dataEnd = parseInt(text.get("$ENDDATA") ?? "", 10) || header.dataEnd;
  if (!Number.isFinite(dataStart) || !Number.isFinite(dataEnd) || dataEnd <= dataStart) {
    throw new Error("Invalid DATA segment range");
  }

  const dataType = (text.get("$DATATYPE") ?? "I").toUpperCase();
  const byteOrd = (text.get("$BYTEORD") ?? "1,2,3,4").trim();
  const littleEndian = byteOrd === "1,2,3,4" || byteOrd === "1,2";

  const params = [];
  const bits = [];
  for (let p = 1; p <= nParams; p++) {
    const label = (text.get(`$P${p}S`) ?? text.get(`$P${p}N`) ?? `P${p}`).trim();
    const range = parseInt(text.get(`$P${p}R`) ?? "", 10);
    const b = parseInt(text.get(`$P${p}B`) ?? "", 10);
    params.push({ label, range: Number.isFinite(range) ? range : null });
    bits.push(Number.isFinite(b) ? b : null);
  }

  const previewN = Math.min(10_000, nEvents);
  const previewIndices = makePreviewIndices(nEvents, previewN);
  const preview = {
    n: previewN,
    channels: Array.from({ length: nParams }, () => new Float32Array(previewN)),
  };

  const dv = new DataView(arrayBuffer, dataStart, dataEnd - dataStart + 1);
  const bytesPerParam = bits.map((b) => bytesForParam(dataType, b));
  const bytesPerEvent = bytesPerParam.reduce((a, b) => a + b, 0);
  const expectedBytes = bytesPerEvent * nEvents;
  if (dv.byteLength < expectedBytes) {
    throw new Error(`DATA segment too small (need ${expectedBytes} bytes, got ${dv.byteLength})`);
  }

  // Parse only preview points without storing full matrix.
  let previewWrite = 0;
  let nextEventIndex = previewIndices[previewWrite] ?? null;

  for (let e = 0; e < nEvents; e++) {
    if (nextEventIndex !== e) continue;

    const eventOffset = e * bytesPerEvent;
    let off = eventOffset;
    for (let p = 0; p < nParams; p++) {
      preview.channels[p][previewWrite] = readValue(dv, off, dataType, bytesPerParam[p], littleEndian);
      off += bytesPerParam[p];
    }

    previewWrite++;
    if (previewWrite >= previewN) break;
    nextEventIndex = previewIndices[previewWrite] ?? null;
  }

  // Optional SPILL/SPILLOVER parse (not used yet; reserved for future iteration).
  const spill = parseSpill(text, nParams);

  return { nEvents, params, preview, spill };
}

export function parseFcsHeader(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer, 0, Math.min(58, arrayBuffer.byteLength));
  if (bytes.length < 58) throw new Error("FCS header too short");
  const headerStr = decodeLatin1(bytes);
  const version = headerStr.slice(0, 6).trim();
  if (!version.startsWith("FCS")) throw new Error("Not an FCS file (missing 'FCS' magic)");

  const textStart = parseInt(headerStr.slice(10, 18).trim(), 10);
  const textEnd = parseInt(headerStr.slice(18, 26).trim(), 10);
  const dataStart = parseInt(headerStr.slice(26, 34).trim(), 10);
  const dataEnd = parseInt(headerStr.slice(34, 42).trim(), 10);
  const analysisStart = parseInt(headerStr.slice(42, 50).trim(), 10);
  const analysisEnd = parseInt(headerStr.slice(50, 58).trim(), 10);

  if (!Number.isFinite(textStart) || !Number.isFinite(textEnd) || textEnd <= textStart) {
    throw new Error("Invalid TEXT segment range in FCS header");
  }

  return {
    version,
    textStart,
    textEnd,
    dataStart: Number.isFinite(dataStart) ? dataStart : 0,
    dataEnd: Number.isFinite(dataEnd) ? dataEnd : 0,
    analysisStart: Number.isFinite(analysisStart) ? analysisStart : 0,
    analysisEnd: Number.isFinite(analysisEnd) ? analysisEnd : 0,
  };
}

export function parseFcsTextSegment(arrayBuffer, textStart, textEnd) {
  const rawBytes = new Uint8Array(arrayBuffer, textStart, textEnd - textStart + 1);
  const raw = decodeLatin1(rawBytes);
  if (raw.length < 2) throw new Error("TEXT segment too short");
  const delim = raw[0];

  const tokens = [];
  let cur = "";
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== delim) {
      cur += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === delim) {
      cur += delim;
      i++;
      continue;
    }
    tokens.push(cur);
    cur = "";
  }
  tokens.push(cur);

  const map = new Map();
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const k = tokens[i].trim().toUpperCase();
    const v = tokens[i + 1];
    if (!k) continue;
    map.set(k, v);
  }
  return map;
}

function decodeLatin1(bytes) {
  // TextDecoder('latin1') is widely supported and preserves byte values.
  return new TextDecoder("latin1").decode(bytes);
}

function bytesForParam(dataType, bits) {
  switch (dataType) {
    case "F":
      return 4;
    case "D":
      return 8;
    case "I": {
      const b = Number.isFinite(bits) ? bits : 16;
      if (b <= 8) return 1;
      if (b <= 16) return 2;
      return 4;
    }
    default:
      throw new Error(`Unsupported $DATATYPE: ${dataType}`);
  }
}

function readValue(dv, offset, dataType, bytes, littleEndian) {
  switch (dataType) {
    case "F":
      return dv.getFloat32(offset, littleEndian);
    case "D":
      return dv.getFloat64(offset, littleEndian);
    case "I":
      if (bytes === 1) return dv.getUint8(offset);
      if (bytes === 2) return dv.getUint16(offset, littleEndian);
      return dv.getUint32(offset, littleEndian);
    default:
      return NaN;
  }
}

function makePreviewIndices(nEvents, previewN) {
  if (previewN >= nEvents) return Uint32Array.from({ length: nEvents }, (_, i) => i);

  // Deterministic-ish evenly spaced sample (better than pure random for MVP).
  const out = new Uint32Array(previewN);
  const step = nEvents / previewN;
  for (let i = 0; i < previewN; i++) out[i] = Math.min(nEvents - 1, Math.floor(i * step));
  return out;
}

function parseSpill(textMap, nParams) {
  const spillRaw = textMap.get("SPILL") ?? textMap.get("$SPILL") ?? textMap.get("SPILLOVER") ?? textMap.get("$SPILLOVER");
  if (!spillRaw) return null;
  const parts = spillRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const n = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Format: n, name1, name2, ..., v11, v12, ...
  const valuesStart = 1 + n;
  const values = parts.slice(valuesStart).map((s) => Number.parseFloat(s));
  if (values.length < n * n) return null;
  const mat = new Float32Array(nParams * nParams);
  for (let r = 0; r < Math.min(n, nParams); r++) {
    for (let c = 0; c < Math.min(n, nParams); c++) {
      const v = values[r * n + c];
      if (Number.isFinite(v) && r !== c) mat[r * nParams + c] = v;
    }
  }
  return mat;
}

