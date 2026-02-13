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

export function parseFcsText(buffer, textStart, textEnd) {
  // Safe slice
  if (textStart >= buffer.byteLength || textEnd >= buffer.byteLength) {
    throw new Error("Text segment out of bounds");
  }
  const textDecoder = new TextDecoder("utf-8"); // Try UTF-8, fallback usually works for ASCII
  const textBytes = new Uint8Array(buffer, textStart, textEnd - textStart + 1);
  const textStr = textDecoder.decode(textBytes);
  
  const delimiter = textStr[0];
  const parts = textStr.split(delimiter);
  const keywords = {};
  
  for (let i = 1; i < parts.length - 1; i += 2) {
    const key = parts[i].toUpperCase();
    const val = parts[i + 1];
    keywords[key] = val;
  }
  
  return keywords;
}

export async function parseFcsFile(buffer) {
  const header = parseFcsHeader(buffer);
  const keywords = parseFcsText(buffer, header.textStart, header.textEnd);
  
  let dataStart = header.dataStart;
  let dataEnd = header.dataEnd;
  
  if (dataStart === 0 && keywords["$BEGINDATA"]) {
    dataStart = parseInt(keywords["$BEGINDATA"], 10);
  }
  if (dataEnd === 0 && keywords["$ENDDATA"]) {
    dataEnd = parseInt(keywords["$ENDDATA"], 10);
  }
  
  const par = parseInt(keywords["$PAR"], 10);
  const tot = parseInt(keywords["$TOT"], 10);
  const datatype = keywords["$DATATYPE"] || "I";
  const byteord = keywords["$BYTEORD"];
  
  // 1,2,3,4 = Little Endian? No.
  // 1,2,3,4 usually means Big Endian (Network order).
  // 4,3,2,1 usually means Little Endian (Intel).
  // Check standard:
  // FCS3.1: "1,2,3,4" means Big Endian. "4,3,2,1" means Little Endian.
  const isLittleEndian = byteord === "4,3,2,1";
  
  const params = [];
  let totalBits = 0;
  
  for (let i = 1; i <= par; i++) {
    const name = keywords[`$P${i}N`] || `Param ${i}`;
    const label = keywords[`$P${i}S`] || name;
    const bits = parseInt(keywords[`$P${i}B`], 10);
    const range = parseFloat(keywords[`$P${i}R`]);
    params.push({ index: i - 1, name, label, bits, range });
    totalBits += bits;
  }
  
  const dataView = new DataView(buffer);
  const eventSize = totalBits / 8; 
  
  // Decide reader
  let readValue;
  let bytesPerValue;
  
  if (datatype === "F") {
    // Float is usually 32-bit
    bytesPerValue = 4;
    readValue = (offset) => dataView.getFloat32(offset, isLittleEndian);
  } else if (datatype === "D") {
    // Double is 64-bit
    bytesPerValue = 8;
    readValue = (offset) => dataView.getFloat64(offset, isLittleEndian);
  } else if (datatype === "I") {
    // Integer can vary per parameter in theory, but usually uniform.
    // Assuming uniform for MVP.
    const bits = params[0].bits;
    bytesPerValue = bits / 8;
    if (bits === 8) readValue = (offset) => dataView.getUint8(offset);
    else if (bits === 16) readValue = (offset) => dataView.getUint16(offset, isLittleEndian);
    else if (bits === 32) readValue = (offset) => dataView.getUint32(offset, isLittleEndian);
    else throw new Error(`Unsupported bit depth for integer: ${bits}`);
  } else {
    throw new Error(`Unsupported datatype: ${datatype}`);
  }
  
  // Preview
  const PREVIEW_LIMIT = 2000;
  const nPreview = Math.min(tot, PREVIEW_LIMIT);
  const stride = Math.floor(tot / nPreview) || 1;
  
  const channelData = params.map(() => new Float32Array(nPreview));
  
  for (let i = 0; i < nPreview; i++) {
    const eventIndex = i * stride;
    const eventOffset = dataStart + eventIndex * par * bytesPerValue;
    
    if (eventOffset + par * bytesPerValue > buffer.byteLength) break;
    
    for (let p = 0; p < par; p++) {
      channelData[p][i] = readValue(eventOffset + p * bytesPerValue);
    }
  }
  
  return {
    version: header.version,
    nEvents: tot,
    params,
    spill: keywords["$SPILLOVER"] || keywords["$SPILL"],
    preview: {
      n: nPreview,
      channels: channelData,
    }
  };
}
