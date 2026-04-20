import { createPlotState } from "./plotState.js";

const SESSION_VERSION = 2;

export function createAnalysisSession(state) {
  if (!state?.dataset || !state?.comp) throw new Error("Load a dataset before exporting a session");

  return {
    version: SESSION_VERSION,
    exportedAt: new Date().toISOString(),
    dataset: {
      name: state.dataset.name ?? "",
      version: state.dataset.version ?? "",
      nEvents: state.dataset.nEvents ?? 0,
      sha256: state.dataset.sha256 ?? "",
      signature: buildDatasetSignature(state.dataset),
      params: (state.dataset.params ?? []).map((param) => ({
        name: param?.name ?? "",
        label: param?.label ?? "",
      })),
    },
    compensation: {
      matrix: state.comp.toJson(),
      selectedFrom: state.comp.selectedFrom ?? 0,
      selectedTo: state.comp.selectedTo ?? 0,
    },
    activePlotId: state.activePlotId ?? null,
    plots: (state.plots ?? []).map(serializePlot),
    gates: {
      selectedGateId: state.selectedGateId ?? "root",
      items: (state.gates ?? []).map((gate) => ({
        id: String(gate.id),
        name: String(gate.name ?? ""),
        parentId: gate.parentId ?? "root",
        definition: structuredClone(gate.definition),
      })),
    },
    singleStain: {
      activeSample: getActiveSingleStainRef(state),
      assignments: (state.singleStain?.samples ?? [])
        .filter((sample) => sample?.stainedReferenceIndex != null)
        .map((sample) => ({
          fileName: String(sample.fileName ?? ""),
          sha256: String(sample.sha256 ?? ""),
          stainedReferenceIndex: Number(sample.stainedReferenceIndex),
        })),
    },
  };
}

export function applyAnalysisSession(state, session) {
  if (!state?.dataset || !state?.comp) throw new Error("Load a dataset before importing a session");
  if (!session || session.version !== SESSION_VERSION) throw new Error("Unsupported session version");

  const currentSignature = buildDatasetSignature(state.dataset);
  if (session.dataset?.signature !== currentSignature) {
    throw new Error("Session dataset signature does not match the loaded dataset");
  }

  state.comp.loadFromJson(session.compensation?.matrix ?? {});
  state.comp.selectedFrom = clampParamIndex(session.compensation?.selectedFrom, state.comp.n);
  state.comp.selectedTo = clampParamIndex(session.compensation?.selectedTo, state.comp.n, 1);

  const plots = Array.isArray(session.plots) && session.plots.length > 0
    ? session.plots.map((plot) => restorePlot(plot, state.dataset.params?.length ?? 0))
    : [];

  state.gates = Array.isArray(session.gates?.items)
    ? session.gates.items.map((gate) => ({
      id: String(gate.id),
      name: String(gate.name ?? ""),
      parentId: gate.parentId ?? "root",
      definition: structuredClone(gate.definition),
    }))
    : [];
  state.selectedGateId = hasGateId(state.gates, session.gates?.selectedGateId) ? session.gates.selectedGateId : "root";
  state.nextGateId = computeNextGateId(state.gates);

  const assignments = session.singleStain?.assignments ?? [];
  for (const sample of state.singleStain?.samples ?? []) {
    const match = findSingleStainAssignment(assignments, sample);
    if (!match) continue;
    sample.stainedReferenceIndex = match.stainedReferenceIndex;
    sample.inferenceConfidence = "manual";
    sample.inferenceReason = "manual";
  }

  const activeRef = session.singleStain?.activeSample;
  const activeSample = (state.singleStain?.samples ?? []).find((sample) => matchesSingleStainRef(sample, activeRef));
  if (activeSample) state.singleStain.activeSampleId = activeSample.id;

  return {
    plots,
    activePlotId: plots.find((plot) => plot.id === session.activePlotId)?.id ?? plots[0]?.id ?? null,
  };
}

export function buildDatasetSignature(dataset) {
  const labels = (dataset?.params ?? [])
    .map((param) => normalizeLabel(param?.label ?? param?.name ?? ""))
    .join("|");
  return [
    normalizeLabel(dataset?.name ?? ""),
    normalizeLabel(dataset?.version ?? ""),
    Number(dataset?.nEvents ?? 0),
    normalizeLabel(dataset?.sha256 ?? ""),
    labels,
  ].join("::");
}

function serializePlot(plot) {
  return {
    id: String(plot.id),
    xParam: Number(plot.xParam ?? 0),
    yParam: Number(plot.yParam ?? 1),
    xScale: plot.xScale ?? plot.scale ?? "linear",
    yScale: plot.yScale ?? plot.scale ?? "linear",
    mode: plot.mode ?? "scatter",
    xMin: plot.xMin ?? null,
    xMax: plot.xMax ?? null,
    yMin: plot.yMin ?? null,
    yMax: plot.yMax ?? null,
    arcsinhCofactor: plot.arcsinhCofactor ?? 150,
    logicleLinthresh: plot.logicleLinthresh ?? 100,
  };
}

function restorePlot(plot, nParams) {
  const restored = createPlotState({
    xParam: clampParamIndex(plot?.xParam, nParams),
    yParam: clampParamIndex(plot?.yParam, nParams, 1),
    xScale: plot?.xScale ?? "linear",
    yScale: plot?.yScale ?? "linear",
    mode: plot?.mode ?? "scatter",
    xMin: parseNullableNumber(plot?.xMin),
    xMax: parseNullableNumber(plot?.xMax),
    yMin: parseNullableNumber(plot?.yMin),
    yMax: parseNullableNumber(plot?.yMax),
    arcsinhCofactor: parseFinite(plot?.arcsinhCofactor, 150),
    logicleLinthresh: parseFinite(plot?.logicleLinthresh, 100),
  });
  if (plot?.id) restored.id = String(plot.id);
  return restored;
}

function getActiveSingleStainRef(state) {
  const activeId = state.singleStain?.activeSampleId;
  const active = (state.singleStain?.samples ?? []).find((sample) => sample.id === activeId);
  if (!active) return null;
  return {
    fileName: active.fileName ?? "",
    sha256: active.sha256 ?? "",
  };
}

function computeNextGateId(gates) {
  let maxId = 0;
  for (const gate of gates) {
    const numeric = Number.parseInt(gate.id, 10);
    if (Number.isFinite(numeric)) maxId = Math.max(maxId, numeric);
  }
  return maxId + 1;
}

function hasGateId(gates, id) {
  if (id === "root") return true;
  return gates.some((gate) => gate.id === id);
}

function parseFinite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function parseNullableNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampParamIndex(value, nParams, fallback = 0) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return Math.min(fallback, Math.max(0, nParams - 1));
  return Math.max(0, Math.min(nParams - 1, numeric));
}

function normalizeLabel(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findSingleStainAssignment(assignments, sample) {
  return assignments.find((entry) => matchesSingleStainRef(sample, entry)) ?? null;
}

function matchesSingleStainRef(sample, ref) {
  if (!sample || !ref) return false;
  const sampleHash = String(sample.sha256 ?? "");
  const refHash = String(ref.sha256 ?? "");
  if (sampleHash && refHash) return sampleHash === refHash;
  return String(sample.fileName ?? "") === String(ref.fileName ?? "");
}
