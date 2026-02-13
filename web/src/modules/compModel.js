function idx(n, from, to) {
  return to * n + from;
}

function clampCoeff(v) {
  if (!Number.isFinite(v)) return 0;
  if (v > 10) return 10;
  if (v < -10) return -10;
  return v;
}

export function createCompModel(nParams, initialCoeffs /* Float32Array n*n (to,from) */) {
  const n = nParams;
  const coeffs = new Float32Array(n * n);
  const original = new Float32Array(n * n);

  if (initialCoeffs && initialCoeffs.length === n * n) {
    coeffs.set(initialCoeffs);
    original.set(initialCoeffs);
    for (let i = 0; i < n; i++) coeffs[idx(n, i, i)] = 0;
    for (let i = 0; i < n; i++) original[idx(n, i, i)] = 0;
  }

  const nonZeroByTo = Array.from({ length: n }, () => []);
  rebuildNonZero();

  const model = {
    n,
    coeffs,
    original,
    selectedFrom: 0,
    selectedTo: Math.min(1, n - 1),
    dirty: false,

    rebuildNonZero,
    getCoeff(from, to) {
      if (from === to) return 0;
      return coeffs[idx(n, from, to)];
    },
    setCoeff(from, to, v) {
      if (from === to) return;
      coeffs[idx(n, from, to)] = clampCoeff(v);
      model.dirty = !equalsArray(coeffs, original);
      rebuildNonZero();
    },
    resetPair(from, to) {
      if (from === to) return;
      coeffs[idx(n, from, to)] = original[idx(n, from, to)];
      model.dirty = !equalsArray(coeffs, original);
      rebuildNonZero();
    },
    resetAll() {
      coeffs.set(original);
      model.dirty = false;
      rebuildNonZero();
    },
    toJson() {
      return {
        version: 1,
        nParams: n,
        coeffs: Array.from(coeffs),
      };
    },
    loadFromJson(obj) {
      if (!obj || obj.version !== 1) throw new Error("Unsupported comp JSON (expected version=1)");
      if (obj.nParams !== n) throw new Error(`Comp JSON param mismatch (expected ${n}, got ${obj.nParams})`);
      if (!Array.isArray(obj.coeffs) || obj.coeffs.length !== n * n) throw new Error("Invalid coeffs length");
      coeffs.set(obj.coeffs.map(clampCoeff));
      for (let i = 0; i < n; i++) coeffs[idx(n, i, i)] = 0;
      original.set(coeffs);
      model.dirty = false;
      rebuildNonZero();
    },
    // Apply to preview sample: rawPreviewChannels[param][k]
    applyPreviewValue(toParam, k, rawPreviewChannels) {
      let v = rawPreviewChannels[toParam][k];
      for (const p of nonZeroByTo[toParam]) v -= p.coeff * rawPreviewChannels[p.from][k];
      return v;
    },
    gatePasses(k, rawPreviewChannels, gateDefs) {
      if (!gateDefs || gateDefs.length === 0) return true;
      for (const def of gateDefs) {
        if (!def) continue;
        const gx = model.applyPreviewValue(def.xParam, k, rawPreviewChannels);
        const gy = model.applyPreviewValue(def.yParam, k, rawPreviewChannels);
        if (!(gx >= def.xMin && gx <= def.xMax && gy >= def.yMin && gy <= def.yMax)) {
          return false;
        }
      }
      return true;
    },
    getWorstPairs() {
      const pairs = [];
      for (let to = 0; to < n; to++) {
        for (const p of nonZeroByTo[to]) {
          pairs.push({ from: p.from, to, coeff: p.coeff });
        }
      }
      pairs.sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));
      return pairs;
    },
  };

  return model;

  function rebuildNonZero() {
    for (let to = 0; to < n; to++) nonZeroByTo[to] = [];
    for (let to = 0; to < n; to++) {
      for (let from = 0; from < n; from++) {
        if (from === to) continue;
        const c = coeffs[idx(n, from, to)];
        if (Math.abs(c) > 1e-12) nonZeroByTo[to].push({ from, coeff: c });
      }
    }
  }
}

function equalsArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

