const STORAGE_KEY = "fcm-app-comp-matrix-v1";

export function createCompSnapshot(compModel, params) {
  if (!compModel) throw new Error("Compensation model is required");

  const labels = getParamLabels(params, compModel.n);
  const signature = createCompSignature(params, compModel.n);
  const pairs = [];

  for (let to = 0; to < compModel.n; to++) {
    for (let from = 0; from < compModel.n; from++) {
      if (from === to) continue;
      const coeff = compModel.getCoeff(from, to);
      if (Math.abs(coeff) <= 1e-12) continue;
      pairs.push({
        from: labels[from],
        to: labels[to],
        coeff,
      });
    }
  }

  return {
    version: 1,
    signature,
    labels,
    pairs,
  };
}

export function restoreCompSnapshot(compModel, params, snapshot) {
  if (!compModel) throw new Error("Compensation model is required");
  if (!snapshot || snapshot.version !== 1) return { restored: 0, matched: false };

  const currentSignature = createCompSignature(params, compModel.n);
  if (snapshot.signature !== currentSignature) {
    return { restored: 0, matched: false };
  }

  const labels = getParamLabels(params, compModel.n);
  const indexByLabel = new Map(labels.map((label, index) => [normalizeLabel(label), index]));
  const coeffs = new Float32Array(compModel.n * compModel.n);
  let restored = 0;

  for (const pair of snapshot.pairs ?? []) {
    const from = indexByLabel.get(normalizeLabel(pair.from));
    const to = indexByLabel.get(normalizeLabel(pair.to));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) continue;
    coeffs[to * compModel.n + from] = Number(pair.coeff) || 0;
    restored++;
  }

  if (restored === 0) {
    return { restored: 0, matched: true };
  }

  compModel.loadFromJson({
    version: 1,
    nParams: compModel.n,
    coeffs: Array.from(coeffs),
  });

  return { restored, matched: true };
}

export function saveCompSnapshotToStorage(compModel, params, storage = globalThis.localStorage) {
  if (!storage) return;
  const snapshot = createCompSnapshot(compModel, params);
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function loadCompSnapshotFromStorage(compModel, params, storage = globalThis.localStorage) {
  if (!storage) return { restored: 0, matched: false };

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { restored: 0, matched: false };

  try {
    return restoreCompSnapshot(compModel, params, JSON.parse(raw));
  } catch {
    return { restored: 0, matched: false };
  }
}

export function clearCompSnapshotFromStorage(storage = globalThis.localStorage) {
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

export function createCompSignature(params, n = params?.length ?? 0) {
  return getParamLabels(params, n)
    .map(normalizeLabel)
    .sort()
    .join("|");
}

function getParamLabels(params, n) {
  return Array.from({ length: n }, (_, index) => params?.[index]?.label ?? params?.[index]?.name ?? `Param ${index + 1}`);
}

function normalizeLabel(label) {
  return String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
