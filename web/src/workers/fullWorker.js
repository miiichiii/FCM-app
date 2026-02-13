import { parseFcsHeader, parseFcsTextSegment } from "../modules/fcs.js";
import { transformValue } from "../modules/transforms.js";

let abortFlag = false;
let full = null; // { nEvents, nParams, channels: Float32Array[] }
let appliedRevision = null;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg?.type) {
      case "apply": {
        abortFlag = false;
        full = null;
        appliedRevision = msg.revision ?? null;
        const result = await applyToAllEvents(msg);
        if (!result) return;
        full = result.full;
        postMessage({ type: "apply-done", nEvents: full.nEvents, nParams: full.nParams, revision: appliedRevision });
        return;
      }
      case "density": {
        if (!full) {
          postMessage({ type: "density-error", requestId: msg.requestId, plotId: msg.plotId, key: msg.key, message: "No full data" });
          return;
        }
        const res = computeDensity(full, msg);
        postMessage(
          {
            type: "density-result",
            requestId: msg.requestId,
            plotId: msg.plotId,
            key: msg.key,
            width: res.width,
            height: res.height,
            counts: res.counts.buffer,
            maxCount: res.maxCount,
            nPassed: res.nPassed,
            total: res.total,
          },
          [res.counts.buffer],
        );
        return;
      }
      case "cancel": {
        abortFlag = true;
        return;
      }
      case "clear": {
        abortFlag = true;
        full = null;
        appliedRevision = null;
        postMessage({ type: "cleared" });
        return;
      }
      default:
        return;
    }
  } catch (err) {
    postMessage({
      type: "error",
      message: String(err?.message ?? err),
      stack: String(err?.stack ?? ""),
    });
  }
};

async function applyToAllEvents(msg) {
  const file = msg.file;
  if (!(file instanceof Blob)) throw new Error("Worker apply: expected file Blob");
  const coeffsIn = msg.coeffs;
  if (!(coeffsIn instanceof ArrayBuffer)) throw new Error("Worker apply: expected coeffs ArrayBuffer");

  postMessage({ type: "apply-progress", done: 0, total: 1, phase: "reading" });
  const buf = await file.arrayBuffer();
  if (abortFlag) {
    postMessage({ type: "apply-cancelled" });
    return null;
  }

  postMessage({ type: "apply-progress", done: 0, total: 1, phase: "parsing" });
  const header = parseFcsHeader(buf);
  const text = parseFcsTextSegment(buf, header.textStart, header.textEnd);

  const nEvents = parseInt(text.get("$TOT") ?? "", 10);
  const nParams = parseInt(text.get("$PAR") ?? "", 10);
  if (!Number.isFinite(nEvents) || nEvents <= 0) throw new Error("Invalid $TOT in FCS TEXT segment");
  if (!Number.isFinite(nParams) || nParams <= 0) throw new Error("Invalid $PAR in FCS TEXT segment");

  const coeffs = new Float32Array(coeffsIn);
  if (coeffs.length !== nParams * nParams) {
    throw new Error(`Worker apply: coeff length mismatch (expected ${nParams * nParams}, got ${coeffs.length})`);
  }

  const dataStart = parseInt(text.get("$BEGINDATA") ?? "", 10) || header.dataStart;
  const dataEnd = parseInt(text.get("$ENDDATA") ?? "", 10) || header.dataEnd;
  if (!Number.isFinite(dataStart) || !Number.isFinite(dataEnd) || dataEnd <= dataStart) {
    throw new Error("Invalid DATA segment range");
  }

  const dataType = (text.get("$DATATYPE") ?? "I").toUpperCase();
  const byteOrd = (text.get("$BYTEORD") ?? "1,2,3,4").trim();
  const littleEndian = byteOrd === "1,2,3,4" || byteOrd === "1,2";

  const bits = [];
  for (let p = 1; p <= nParams; p++) {
    const b = parseInt(text.get(`$P${p}B`) ?? "", 10);
    bits.push(Number.isFinite(b) ? b : null);
  }

  const bytesPerParam = bits.map((b) => bytesForParam(dataType, b));
  const bytesPerEvent = bytesPerParam.reduce((a, b) => a + b, 0);

  const dv = new DataView(buf, dataStart, dataEnd - dataStart + 1);
  const expectedBytes = bytesPerEvent * nEvents;
  if (dv.byteLength < expectedBytes) {
    throw new Error(`DATA segment too small (need ${expectedBytes} bytes, got ${dv.byteLength})`);
  }

  postMessage({ type: "apply-progress", done: 0, total: nEvents, phase: "applying" });

  const nonZeroByTo = buildNonZeroByTo(coeffs, nParams);
  const channels = Array.from({ length: nParams }, () => new Float32Array(nEvents));
  const eventVals = new Float32Array(nParams);

  const chunk = 8192;
  for (let e = 0; e < nEvents; e++) {
    if (abortFlag) {
      postMessage({ type: "apply-cancelled" });
      return null;
    }

    const eventOffset = e * bytesPerEvent;
    let off = eventOffset;
    for (let p = 0; p < nParams; p++) {
      eventVals[p] = readValue(dv, off, dataType, bytesPerParam[p], littleEndian);
      off += bytesPerParam[p];
    }

    for (let to = 0; to < nParams; to++) {
      let v = eventVals[to];
      const fromList = nonZeroByTo[to];
      for (let i = 0; i < fromList.length; i++) v -= fromList[i].coeff * eventVals[fromList[i].from];
      channels[to][e] = v;
    }

    if (e % chunk === 0) postMessage({ type: "apply-progress", done: e, total: nEvents, phase: "applying" });
  }

  postMessage({ type: "apply-progress", done: nEvents, total: nEvents, phase: "finalizing" });
  return { full: { nEvents, nParams, channels } };
}

function idx(n, from, to) {
  return to * n + from;
}

function computeDensity(fullData, msg) {
  const nEvents = fullData.nEvents;
  const channels = fullData.channels;

  const xParam = Number(msg.xParam ?? 0);
  const yParam = Number(msg.yParam ?? 1);
  const scale = String(msg.scale ?? "linear");
  const axisRanges = msg.axisRanges ?? {};
  const scaleParams = msg.scaleParams ?? {};

  const binsW = Math.max(8, Math.min(512, Number(msg.binsW ?? 128)));
  const binsH = Math.max(8, Math.min(512, Number(msg.binsH ?? 128)));
  const counts = new Uint32Array(binsW * binsH);

  const xMinT = transformValue(scale, axisRanges.xMin ?? 0, scaleParams);
  const xMaxT = transformValue(scale, axisRanges.xMax ?? 1, scaleParams);
  const yMinT = transformValue(scale, axisRanges.yMin ?? 0, scaleParams);
  const yMaxT = transformValue(scale, axisRanges.yMax ?? 1, scaleParams);

  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;

  const gates = Array.isArray(msg.gates) ? msg.gates : [];

  let maxCount = 0;
  let nPassed = 0;

  for (let e = 0; e < nEvents; e++) {
    let pass = true;
    for (let gi = 0; gi < gates.length; gi++) {
      const g = gates[gi];
      if (!g) continue;
      const gx = channels[g.xParam]?.[e];
      const gy = channels[g.yParam]?.[e];
      if (!(gx >= g.xMin && gx <= g.xMax && gy >= g.yMin && gy <= g.yMax)) {
        pass = false;
        break;
      }
    }
    if (!pass) continue;

    const xv = channels[xParam]?.[e];
    const yv = channels[yParam]?.[e];
    const xt = transformValue(scale, xv, scaleParams);
    const yt = transformValue(scale, yv, scaleParams);
    const nx = (xt - xMinT) / denomX;
    const ny = (yt - yMinT) / denomY;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;

    const bx = clampInt(Math.floor(nx * binsW), 0, binsW - 1);
    const by = clampInt(binsH - 1 - Math.floor(ny * binsH), 0, binsH - 1);
    const binIdx = by * binsW + bx;
    const c = ++counts[binIdx];
    if (c > maxCount) maxCount = c;
    nPassed++;
  }

  return { width: binsW, height: binsH, counts, maxCount, nPassed, total: nEvents };
}

function clampInt(x, min, max) {
  const xi = x | 0;
  return Math.max(min, Math.min(max, xi));
}

function buildNonZeroByTo(coeffs, n) {
  const out = Array.from({ length: n }, () => []);
  for (let to = 0; to < n; to++) {
    for (let from = 0; from < n; from++) {
      if (from === to) continue;
      const c = coeffs[idx(n, from, to)];
      if (Math.abs(c) > 1e-12) out[to].push({ from, coeff: c });
    }
  }
  return out;
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
