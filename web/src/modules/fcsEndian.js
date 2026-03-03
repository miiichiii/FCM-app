export function parseFcsByteOrder(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (normalized === "4,3,2,1" || normalized === "2,1") return true;
  if (normalized === "1,2,3,4" || normalized === "1,2") return false;
  return null;
}

export function resolveFcsEndian({
  dataView,
  dataStart,
  bufferByteLength,
  dataType,
  bytesPerParam,
  paramRanges,
  nEvents,
  bytesPerEvent,
  declaredLittleEndian,
}) {
  const needsEndian =
    dataType === "F" ||
    dataType === "D" ||
    (dataType === "I" && bytesPerParam.some((b) => b > 1));

  if (!needsEndian) return true;

  const candidates =
    declaredLittleEndian == null ? [true, false] : [declaredLittleEndian, !declaredLittleEndian];

  const scored = candidates.map((littleEndian) => ({
    littleEndian,
    score: scoreEndianCandidate({
      dataView,
      dataStart,
      bufferByteLength,
      dataType,
      bytesPerParam,
      paramRanges,
      nEvents,
      bytesPerEvent,
      littleEndian,
    }),
  }));

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!second) return best.littleEndian;

  // Keep declared byte order when the confidence gap is very small.
  if (declaredLittleEndian != null && best.score - second.score < 0.2) {
    return declaredLittleEndian;
  }
  return best.littleEndian;
}

function scoreEndianCandidate({
  dataView,
  dataStart,
  bufferByteLength,
  dataType,
  bytesPerParam,
  paramRanges,
  nEvents,
  bytesPerEvent,
  littleEndian,
}) {
  const sampleEvents = Math.max(1, Math.min(nEvents, 128));
  const sampleParams = Math.max(1, Math.min(bytesPerParam.length, 12));
  const stride = Math.max(1, Math.floor(nEvents / sampleEvents));

  let score = 0;
  let seen = 0;

  for (let i = 0; i < sampleEvents; i++) {
    const eventIndex = i * stride;
    const eventOffset = dataStart + eventIndex * bytesPerEvent;
    if (eventOffset + bytesPerEvent > bufferByteLength) break;

    let off = eventOffset;
    for (let p = 0; p < sampleParams; p++) {
      const v = readRawValue(dataView, off, dataType, bytesPerParam[p], littleEndian);
      off += bytesPerParam[p];
      seen++;

      if (!Number.isFinite(v)) {
        score -= 8;
        continue;
      }

      score += 2;

      const abs = Math.abs(v);
      score -= Math.min(6, Math.log10(1 + abs)) * 0.4;
      if (abs <= 1e8) score += 0.5;
      else if (abs > 1e12) score -= 2;

      const range = paramRanges[p];
      if (Number.isFinite(range) && range > 0) {
        const lo = -Math.max(1, range * 0.05);
        const hi = range * 4;
        if (v >= lo && v <= hi) score += 2;
        else if (v >= -range && v <= range * 32) score += 0.25;
        else score -= 2;
      } else if (v >= -1e3) {
        score += 0.25;
      }
    }
  }

  if (seen === 0) return Number.NEGATIVE_INFINITY;
  return score / seen;
}

function readRawValue(dataView, offset, dataType, bytes, littleEndian) {
  switch (dataType) {
    case "F":
      return dataView.getFloat32(offset, littleEndian);
    case "D":
      return dataView.getFloat64(offset, littleEndian);
    case "I":
      if (bytes === 1) return dataView.getUint8(offset);
      if (bytes === 2) return dataView.getUint16(offset, littleEndian);
      if (bytes === 4) return dataView.getUint32(offset, littleEndian);
      return NaN;
    default:
      return NaN;
  }
}
