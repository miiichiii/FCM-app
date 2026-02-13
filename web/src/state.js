import { createPlotState } from "./modules/plotState.js";

export function createDefaultState() {
  return {
    dataset: null,
    plots: [],
    plotCards: new Map(),
    activePlotId: null,
    comp: null,
    compRevision: 0,
    gates: [], // { id, name, parentId, definition: { type, ... } }
    selectedGateId: "root",
    nextGateId: 1,
    gatingArmed: false,
    fullWorker: null,
    fullApply: {
      status: "idle", // idle | running | done | cancelled | error
      phase: "",
      done: 0,
      total: 0,
      appliedRevision: null,
      error: null,
    },
    density: {
      cacheByPlotId: new Map(), // plotId -> { key, width, height, counts: Uint32Array, maxCount, nPassed, total }
      pendingByPlotId: new Map(), // plotId -> { requestId, key }
      nextRequestId: 1,
    },
    createPlot: createPlotState,
  };
}

export function setDataset(state, dataset) {
  state.dataset = dataset;
  state.gates = [];
  state.selectedGateId = "root";
  state.nextGateId = 1;
  state.gatingArmed = false;
}

export function setStatusText(text) {
  const statusEl = document.getElementById("statusText");
  statusEl.textContent = text;
}

export function updateAllPlots(state) {
  for (const card of state.plotCards.values()) card.render();
}
