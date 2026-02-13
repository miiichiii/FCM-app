import { createDefaultState, setDataset, setStatusText, updateAllPlots } from "./state.js";
import { parseFcsFile } from "./modules/fcs.js";
import { createDemoDataset } from "./modules/demo.js";
import { createPlotCard } from "./modules/plotCard.js";
import { createCompModel, downloadCompJson, loadCompJsonFromFile } from "./modules/comp.js";
import { armGating, addGate, clearAllGates, getGateById } from "./modules/gate.js";

const state = createDefaultState();
const plotsEl = document.getElementById("plots");

const LARGE_EVENT_THRESHOLD = 500_000;

const applyAllBtn = document.getElementById("applyAllBtn");
const applyCancelBtn = document.getElementById("applyCancelBtn");
const applyProgressEl = document.getElementById("applyProgress");
const applyProgressBarEl = document.getElementById("applyProgressBar");
const applyProgressTextEl = document.getElementById("applyProgressText");
const applyStatusEl = document.getElementById("applyStatus");

function defaultPlotMode() {
  const n = state.dataset?.nEvents ?? 0;
  return n >= LARGE_EVENT_THRESHOLD ? "density" : "scatter";
}

function refreshLargeEventWarning() {
  const warnEl = document.getElementById("largeEventWarning");
  if (!warnEl) return;
  const ds = state.dataset;
  if (!ds || !(ds.nEvents >= LARGE_EVENT_THRESHOLD)) {
    warnEl.hidden = true;
    warnEl.textContent = "";
    return;
  }

  const previewN = ds.preview?.n ?? 0;
  const canApply = Boolean(ds.sourceFile && state.comp);
  const upToDate = state.fullApply.status === "done" && state.fullApply.appliedRevision === state.compRevision;
  const applyText = canApply ? (upToDate ? "Full-data is applied." : "Click Apply-to-all for full-density.") : "Full apply is unavailable for demo.";

  warnEl.hidden = false;
  warnEl.textContent = `Large dataset (${ds.nEvents.toLocaleString()} events). Plots default to density. Scatter shows preview only (${previewN.toLocaleString()} pts). ${applyText}`;
}

function refreshParamUI() {
  const fileNameEl = document.getElementById("fileName");
  const eventCountEl = document.getElementById("eventCount");
  const paramCountEl = document.getElementById("paramCount");
  const paramListEl = document.getElementById("paramList");

  if (!state.dataset) {
    fileNameEl.textContent = "—";
    eventCountEl.textContent = "—";
    paramCountEl.textContent = "—";
    paramListEl.innerHTML = "";
    return;
  }

  fileNameEl.textContent = state.dataset.name;
  eventCountEl.textContent = String(state.dataset.nEvents);
  paramCountEl.textContent = String(state.dataset.params.length);
  paramListEl.innerHTML = "";

  for (const [idx, p] of state.dataset.params.entries()) {
    const item = document.createElement("div");
    item.className = "param-item";
    const left = document.createElement("div");
    left.textContent = p.label;
    const right = document.createElement("div");
    right.className = "mono";
    right.textContent = `#${idx + 1}`;
    item.append(left, right);
    paramListEl.appendChild(item);
  }
  refreshLargeEventWarning();
}

function refreshCompUI() {
  const fromSel = document.getElementById("compFrom");
  const toSel = document.getElementById("compTo");
  const slider = document.getElementById("compSlider");
  const valueEl = document.getElementById("compValue");
  const dirtyHint = document.getElementById("compDirtyHint");

  if (!state.dataset || !state.comp) {
    fromSel.innerHTML = "";
    toSel.innerHTML = "";
    slider.value = "0";
    valueEl.textContent = "0.000";
    dirtyHint.hidden = true;
    return;
  }

  const options = state.dataset.params
    .map((p, i) => ({ i, label: p.label }))
    .map(({ i, label }) => `<option value="${i}">${label}</option>`)
    .join("");

  fromSel.innerHTML = options;
  toSel.innerHTML = options;

  fromSel.value = String(state.comp.selectedFrom);
  toSel.value = String(state.comp.selectedTo);

  const v = state.comp.getCoeff(state.comp.selectedFrom, state.comp.selectedTo);
  slider.value = String(v);
  valueEl.textContent = v.toFixed(3);
  dirtyHint.hidden = !state.comp.dirty;
}

function refreshWorstPairsUI() {
  const listEl = document.getElementById("worstPairsList");
  if (!state.dataset || !state.comp) {
    listEl.innerHTML = "";
    return;
  }

  const pairs = state.comp.getWorstPairs();
  listEl.innerHTML = "";

  if (pairs.length === 0) {
    const item = document.createElement("div");
    item.className = "param-item-empty";
    item.textContent = "No compensation applied.";
    listEl.appendChild(item);
    return;
  }

  for (const p of pairs.slice(0, 10)) {
    const item = document.createElement("div");
    item.className = "param-item";
    const left = document.createElement("div");
    left.textContent = `${state.dataset.params[p.from].label} → ${state.dataset.params[p.to].label}`;
    const right = document.createElement("div");
    right.className = "mono";
    right.textContent = p.coeff.toFixed(3);
    item.append(left, right);
    listEl.appendChild(item);
  }
}


function refreshApplyUI() {
  const canApply = Boolean(state.dataset?.sourceFile && state.comp);
  const running = state.fullApply.status === "running";
  const hasApplied = state.fullApply.status === "done";
  const upToDate = hasApplied && state.fullApply.appliedRevision === state.compRevision;

  applyAllBtn.disabled = !canApply || running;
  applyCancelBtn.hidden = !running;

  if (!canApply) {
    applyProgressEl.hidden = true;
    applyProgressTextEl.textContent = "";
    applyStatusEl.textContent = state.dataset ? "Load an FCS file to enable" : "";
    refreshLargeEventWarning();
    return;
  }

  if (running) {
    const done = state.fullApply.done ?? 0;
    const total = state.fullApply.total ?? 0;
    const phase = state.fullApply.phase ?? "";
    const pct = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
    applyProgressEl.hidden = false;
    applyProgressBarEl.style.width = `${pct.toFixed(1)}%`;
    if (phase && phase !== "applying") {
      applyProgressTextEl.textContent = `${phase}…`;
    } else {
      applyProgressTextEl.textContent = total > 0 ? `${pct.toFixed(1)}% (${done.toLocaleString()}/${total.toLocaleString()})` : "";
    }
    applyStatusEl.textContent = "Running";
    refreshLargeEventWarning();
    return;
  }

  applyProgressEl.hidden = true;
  applyProgressTextEl.textContent = "";

  if (state.fullApply.status === "error") {
    applyStatusEl.textContent = `Error`;
    refreshLargeEventWarning();
    return;
  }
  if (state.fullApply.status === "cancelled") {
    applyStatusEl.textContent = "Cancelled";
    refreshLargeEventWarning();
    return;
  }
  if (hasApplied) {
    applyStatusEl.textContent = upToDate ? "Applied ✅" : "Applied (stale)";
    refreshLargeEventWarning();
    return;
  }
  applyStatusEl.textContent = "Not applied";
  refreshLargeEventWarning();
}

function refreshGateHierarchyUI() {
  const treeEl = document.getElementById("gateHierarchyTree");
  const gateEditEl = document.getElementById("gateEdit");
  treeEl.innerHTML = "";

  const renderNode = (gate, depth) => {
    const item = document.createElement("div");
    item.className = "gate-tree-item";
    item.style.paddingLeft = `${depth * 16}px`;
    item.textContent = gate.name;
    item.classList.toggle("selected", state.selectedGateId === gate.id);
    item.addEventListener("click", () => {
      state.selectedGateId = gate.id;
      refreshGateHierarchyUI();
      updateAllPlots(state);
    });
    treeEl.appendChild(item);

    const children = state.gates.filter((g) => g.parentId === gate.id);
    for (const child of children) {
      renderNode(child, depth + 1);
    }
  };

  renderNode({ id: "root", name: "All Events" }, 0);

  const selectedGate = getGateById(state, state.selectedGateId);
  if (selectedGate && selectedGate.id !== "root") {
    gateEditEl.hidden = false;
    const def = selectedGate.definition;
    document.getElementById("gateXMin").value = String(def.xMin);
    document.getElementById("gateXMax").value = String(def.xMax);
    document.getElementById("gateYMin").value = String(def.yMin);
    document.getElementById("gateYMax").value = String(def.yMax);
  } else {
    gateEditEl.hidden = true;
  }
}

window.addEventListener("gate-hierarchy-changed", () => {
  refreshGateHierarchyUI();
  updateAllPlots(state);
});

function mountPlot(plot) {
  const card = createPlotCard(state, plot, () => {
    state.activePlotId = plot.id;
    updateAllPlots(state);
    refreshGateHierarchyUI();
  });
  plotsEl.appendChild(card.el);
  state.plotCards.set(plot.id, card);
}

function resetPlots() {
  plotsEl.innerHTML = "";
  state.plotCards.clear();
  state.plots = [];
  state.activePlotId = null;
}

function ensureTwoPlots() {
  if (!state.dataset) return;
  resetPlots();
  const p = state.dataset.params.length;
  const mode = defaultPlotMode();
  const plot1 = state.createPlot({
    xParam: 0,
    yParam: Math.min(1, p - 1),
    scale: "linear",
    mode,
  });
  const plot2 = state.createPlot({
    xParam: Math.min(2, p - 1),
    yParam: Math.min(3, p - 1),
    scale: "linear",
    mode,
  });
  state.plots.push(plot1, plot2);
  state.activePlotId = plot1.id;
  mountPlot(plot1);
  mountPlot(plot2);
  updateAllPlots(state);
}

async function loadDatasetFromFile(file) {
  if (state.fullWorker) {
    state.fullWorker.terminate();
    state.fullWorker = null;
  }
  setStatusText("Reading file…");
  const buf = await file.arrayBuffer();
  setStatusText("Parsing FCS…");
  const parsed = await parseFcsFile(buf);
  const dataset = {
    name: file.name,
    nEvents: parsed.nEvents,
    params: parsed.params,
    preview: parsed.preview,
    sourceFile: file,
  };
  setDataset(state, dataset);
  state.comp = createCompModel(parsed.params.length, parsed.spill ?? null);
  state.compRevision = 0;
  state.fullApply.status = "idle";
  state.fullApply.phase = "";
  state.fullApply.done = 0;
  state.fullApply.total = 0;
  state.fullApply.appliedRevision = null;
  state.fullApply.error = null;
  refreshParamUI();
  refreshCompUI();
  refreshWorstPairsUI();
  refreshApplyUI();
  setCompControlsEnabled(true);
  ensureTwoPlots();
  setStatusText(`Loaded ${file.name}`);
}

function loadDemo() {
  if (state.fullWorker) {
    state.fullWorker.terminate();
    state.fullWorker = null;
  }
  const demo = createDemoDataset();
  setDataset(state, demo);
  state.comp = createCompModel(demo.params.length, null);
  state.compRevision = 0;
  state.fullApply.status = "idle";
  state.fullApply.phase = "";
  state.fullApply.done = 0;
  state.fullApply.total = 0;
  state.fullApply.appliedRevision = null;
  state.fullApply.error = null;
  refreshParamUI();
  refreshCompUI();
  refreshWorstPairsUI();
  refreshApplyUI();
  setCompControlsEnabled(true);
  ensureTwoPlots();
  setStatusText("Loaded demo dataset");
}

// Data drop zone
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    await loadDatasetFromFile(file);
  } catch (err) {
    console.error(err);
    setStatusText(`Failed to load: ${String(err?.message ?? err)}`);
  }
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await loadDatasetFromFile(file);
  } catch (err) {
    console.error(err);
    setStatusText(`Failed to load: ${String(err?.message ?? err)}`);
  } finally {
    fileInput.value = "";
  }
});

// Demo
document.getElementById("loadDemoBtn").addEventListener("click", () => loadDemo());

// Plots
document.getElementById("addPlotBtn").addEventListener("click", () => {
  if (!state.dataset) return;
  const plot = state.createPlot({
    xParam: 0,
    yParam: Math.min(1, state.dataset.params.length - 1),
    scale: "linear",
    mode: defaultPlotMode(),
  });
  state.plots.push(plot);
  state.activePlotId = plot.id;
  mountPlot(plot);
  updateAllPlots(state);
});

// Gate
document.getElementById("newGateBtn").addEventListener("click", () => {
  armGating(state);
  refreshGateHierarchyUI();
  setStatusText("Gate armed: drag on the active plot to create a rectangle gate.");
});
document.getElementById("clearAllGatesBtn").addEventListener("click", () => {
  clearAllGates(state);
  refreshGateHierarchyUI();
  updateAllPlots(state);
});

// Compensation controls
const compFrom = document.getElementById("compFrom");
const compTo = document.getElementById("compTo");
const compSlider = document.getElementById("compSlider");
const compValue = document.getElementById("compValue");
compFrom.addEventListener("change", () => {
  if (!state.comp) return;
  state.comp.selectedFrom = Number(compFrom.value);
  refreshCompUI();
});
compTo.addEventListener("change", () => {
  if (!state.comp) return;
  state.comp.selectedTo = Number(compTo.value);
  refreshCompUI();
});
compSlider.addEventListener("input", () => {
  if (!state.comp) return;
  const i = state.comp.selectedFrom;
  const j = state.comp.selectedTo;
  const v = Number(compSlider.value);
  state.comp.setCoeff(i, j, v);
  state.compRevision++;
  compValue.textContent = v.toFixed(3);
  document.getElementById("compDirtyHint").hidden = !state.comp.dirty;
  refreshApplyUI();
  refreshWorstPairsUI();
  updateAllPlots(state);
});
document.getElementById("compResetBtn").addEventListener("click", () => {
  if (!state.comp) return;
  state.comp.resetPair(state.comp.selectedFrom, state.comp.selectedTo);
  state.compRevision++;
  refreshCompUI();
  refreshApplyUI();
  refreshWorstPairsUI();
  updateAllPlots(state);
});
document.getElementById("compResetAllBtn").addEventListener("click", () => {
  if (!state.comp) return;
  state.comp.resetAll();
  state.compRevision++;
  refreshCompUI();
  refreshApplyUI();
  refreshWorstPairsUI();
  updateAllPlots(state);
});
document.getElementById("downloadCompBtn").addEventListener("click", () => {
  if (!state.comp) return;
  downloadCompJson(state.comp);
});
document.getElementById("uploadCompInput").addEventListener("change", async (e) => {
  if (!state.comp) return;
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await loadCompJsonFromFile(state.comp, file);
    state.compRevision++;
    refreshCompUI();
    refreshApplyUI();
    refreshWorstPairsUI();
    updateAllPlots(state);
    setStatusText("Loaded compensation JSON");
  } catch (err) {
    console.error(err);
    setStatusText(`Failed to load comp JSON: ${String(err?.message ?? err)}`);
  } finally {
    e.target.value = "";
  }
});

// Apply-to-all (Worker)
function ensureFullWorker() {
  if (state.fullWorker) return state.fullWorker;
  const worker = new Worker(new URL("./workers/fullWorker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e) => handleFullWorkerMessage(e.data));
  worker.addEventListener("error", (e) => {
    console.error(e);
    state.fullApply.status = "error";
    state.fullApply.error = String(e?.message ?? e);
    refreshApplyUI();
    setStatusText(`Worker error: ${state.fullApply.error}`);
    setCompControlsEnabled(true);
  });
  state.fullWorker = worker;
  return worker;
}

function setCompControlsEnabled(enabled) {
  for (const id of ["compFrom", "compTo", "compSlider", "compResetBtn", "compResetAllBtn", "downloadCompBtn"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  }
  const upload = document.getElementById("uploadCompInput");
  if (upload) upload.disabled = !enabled;
}

function handleFullWorkerMessage(msg) {
  switch (msg?.type) {
    case "apply-progress": {
      state.fullApply.status = "running";
      state.fullApply.phase = msg.phase ?? "";
      state.fullApply.done = Number(msg.done ?? 0);
      state.fullApply.total = Number(msg.total ?? 0);
      refreshApplyUI();
      return;
    }
    case "apply-done": {
      state.fullApply.status = "done";
      state.fullApply.phase = "";
      state.fullApply.done = Number(msg.nEvents ?? state.fullApply.total ?? 0);
      state.fullApply.total = Number(msg.nEvents ?? state.fullApply.total ?? 0);
      state.fullApply.appliedRevision = msg.revision ?? null;
      state.fullApply.error = null;
      refreshApplyUI();
      setCompControlsEnabled(true);
      setStatusText(`Apply-to-all done (${Number(msg.nEvents ?? 0).toLocaleString()} events)`);
      return;
    }
    case "apply-cancelled": {
      state.fullApply.status = "cancelled";
      state.fullApply.phase = "";
      state.fullApply.error = null;
      refreshApplyUI();
      setCompControlsEnabled(true);
      setStatusText("Apply-to-all cancelled");
      return;
    }
    case "cleared": {
      state.fullApply.status = "idle";
      state.fullApply.phase = "";
      state.fullApply.done = 0;
      state.fullApply.total = 0;
      state.fullApply.appliedRevision = null;
      state.fullApply.error = null;
      refreshApplyUI();
      return;
    }
    case "error": {
      console.error(msg?.stack ?? msg);
      state.fullApply.status = "error";
      state.fullApply.phase = "";
      state.fullApply.error = String(msg?.message ?? "Unknown worker error");
      refreshApplyUI();
      setCompControlsEnabled(true);
      setStatusText(`Apply-to-all failed: ${state.fullApply.error}`);
      return;
    }
    case "density-result": {
      const pending = state.density.pendingByPlotId.get(msg.plotId);
      if (!pending || pending.requestId !== msg.requestId) return;

      state.density.pendingByPlotId.delete(msg.plotId);
      state.density.cacheByPlotId.set(msg.plotId, {
        key: msg.key,
        width: msg.width,
        height: msg.height,
        counts: new Uint32Array(msg.counts),
        maxCount: msg.maxCount,
        nPassed: msg.nPassed,
        total: msg.total,
      });
      updateAllPlots(state);
      return;
    }
    case "density-error": {
      const pending = state.density.pendingByPlotId.get(msg.plotId);
      if (!pending || pending.requestId !== msg.requestId) return;
      state.density.pendingByPlotId.delete(msg.plotId);
      console.error(`Density error for plot ${msg.plotId}: ${msg.message}`);
      // We might want to show an error on the plot itself
      updateAllPlots(state);
      return;
    }
    default:
      return;
  }
}

async function startApplyToAll() {
  if (!state.dataset?.sourceFile || !state.comp) return;
  const worker = ensureFullWorker();
  state.fullApply.status = "running";
  state.fullApply.phase = "starting";
  state.fullApply.done = 0;
  state.fullApply.total = state.dataset.nEvents;
  state.fullApply.appliedRevision = null;
  state.fullApply.error = null;
  refreshApplyUI();
  setCompControlsEnabled(false);

  const coeffCopy = new Float32Array(state.comp.coeffs);
  worker.postMessage(
    {
      type: "apply",
      file: state.dataset.sourceFile,
      coeffs: coeffCopy.buffer,
      revision: state.compRevision,
    },
    [coeffCopy.buffer],
  );
  setStatusText("Apply-to-all started (Worker) …");
}

function cancelApplyToAll() {
  if (!state.fullWorker) return;
  if (state.fullApply.status !== "running") return;
  state.fullWorker.postMessage({ type: "cancel" });
  setStatusText("Cancelling apply-to-all…");
}

applyAllBtn.addEventListener("click", () => startApplyToAll());
applyCancelBtn.addEventListener("click", () => cancelApplyToAll());

// Initial UI
refreshParamUI();
refreshCompUI();
refreshWorstPairsUI();
refreshGateHierarchyUI();
refreshApplyUI();
setStatusText("Drop an FCS file (or load demo) to begin.");

for (const id of ["gateXMin", "gateXMax", "gateYMin", "gateYMax"]) {
  document.getElementById(id).addEventListener("change", () => {
    const selectedGate = getGateById(state, state.selectedGateId);
    if (!selectedGate || selectedGate.id === "root") return;

    const xMin = Number(document.getElementById("gateXMin").value);
    const xMax = Number(document.getElementById("gateXMax").value);
    const yMin = Number(document.getElementById("gateYMin").value);
    const yMax = Number(document.getElementById("gateYMax").value);
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return;

    selectedGate.definition.xMin = Math.min(xMin, xMax);
    selectedGate.definition.xMax = Math.max(xMin, xMax);
    selectedGate.definition.yMin = Math.min(yMin, yMax);
    selectedGate.definition.yMax = Math.max(yMin, yMax);
    
    refreshGateHierarchyUI();
    updateAllPlots(state);
  });
}
