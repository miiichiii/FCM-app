import { createDefaultState, setDataset, setStatusText, updateAllPlots } from "./state.js";
import { parseFcsFile } from "./modules/fcs.js";
import { createDemoDataset } from "./modules/demo.js";
import { createPlotCard } from "./modules/plotCard.js";
import {
  createCompModel,
  downloadCompJson,
  loadCompJsonFromFile,
  downloadCompCsv,
  loadCompCsvFromFile,
} from "./modules/comp.js";
import { armGating, addGate, clearAllGates, getGateById } from "./modules/gate.js";
import { createSingleStainRecord, getCompRelevantParamIndices } from "./modules/singleStain.js";
import { renderSingleStainReview } from "./modules/singleStainReview.js";
import { initTheme, toggleTheme, getCurrentTheme } from "./modules/theme.js";

globalThis.__FCM_APP_BOOTED = true;

const state = createDefaultState();
const plotsEl = document.getElementById("plots");

const LARGE_EVENT_THRESHOLD = 500_000;

const applyAllBtn = document.getElementById("applyAllBtn");
const applyCancelBtn = document.getElementById("applyCancelBtn");
const applyProgressEl = document.getElementById("applyProgress");
const applyProgressBarEl = document.getElementById("applyProgressBar");
const applyProgressTextEl = document.getElementById("applyProgressText");
const applyStatusEl = document.getElementById("applyStatus");
const singleStainInput = document.getElementById("singleStainInput");
const singleStainListEl = document.getElementById("singleStainList");
const singleStainSectionEl = document.getElementById("singleStainSection");
const singleStainGridEl = document.getElementById("singleStainGrid");
const singleStainSummaryEl = document.getElementById("singleStainSummary");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const compMatrixWrapEl = document.getElementById("compMatrixWrap");
const compMatrixTableEl = document.getElementById("compMatrixTable");
const toggleMatrixBtn = document.getElementById("toggleMatrixBtn");

initTheme();

function defaultPlotMode() {
  const n = state.dataset?.nEvents ?? 0;
  return n >= LARGE_EVENT_THRESHOLD ? "density" : "scatter";
}

function refreshThemeUI() {
  if (!themeToggleBtn) return;
  themeToggleBtn.textContent = `Theme: ${getCurrentTheme() === "dark" ? "Dark" : "Light"}`;
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
  const canApply = Boolean(ds.sourceFile && state.comp && ds.nEvents > 0);
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

function refreshCompMatrixUI() {
  if (!compMatrixTableEl) return;
  compMatrixTableEl.innerHTML = "";

  if (!state.dataset || !state.comp) {
    return;
  }

  const table = document.createElement("table");
  table.className = "matrix-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "X \\ Y";
  headRow.appendChild(corner);

  for (let from = 0; from < state.dataset.params.length; from++) {
    const th = document.createElement("th");
    th.textContent = state.dataset.params[from]?.label ?? `#${from + 1}`;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let to = 0; to < state.dataset.params.length; to++) {
    const row = document.createElement("tr");
    const rowLabel = document.createElement("th");
    rowLabel.textContent = state.dataset.params[to]?.label ?? `#${to + 1}`;
    row.appendChild(rowLabel);

    for (let from = 0; from < state.dataset.params.length; from++) {
      const td = document.createElement("td");
      const coeff = from === to ? 0 : state.comp.getCoeff(from, to);
      td.textContent = coeff.toFixed(3);
      if (state.comp.selectedFrom === from && state.comp.selectedTo === to) {
        td.classList.add("active");
      }
      if (Math.abs(coeff) > 0.0005) {
        td.classList.add("nonzero");
      }
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  compMatrixTableEl.appendChild(table);
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

function getReferenceParams() {
  if (state.dataset?.params?.length) return state.dataset.params;
  return state.singleStain.samples[0]?.referenceParams ?? [];
}

function pickActiveSingleStainId() {
  const resolved = state.singleStain.samples.find((sample) => sample.stainedReferenceIndex != null);
  return resolved?.id ?? state.singleStain.samples[0]?.id ?? null;
}

function rebindSingleStainSamples(referenceParams) {
  state.singleStain.compParamIndices = referenceParams?.length ? getCompRelevantParamIndices(referenceParams) : [];
  if (state.singleStain.samples.length === 0 || !referenceParams?.length) return;

  state.singleStain.samples = state.singleStain.samples.map((sample) => {
    const rebound = createSingleStainRecord(sample.fileName, sample.parsed, referenceParams);
    rebound.id = sample.id;
    if (sample.inferenceReason === "manual" && sample.stainedReferenceIndex != null) {
      rebound.stainedReferenceIndex = sample.stainedReferenceIndex;
      rebound.inferenceConfidence = "manual";
      rebound.inferenceReason = "manual";
    }
    return rebound;
  });

  if (!state.singleStain.samples.some((sample) => sample.id === state.singleStain.activeSampleId)) {
    state.singleStain.activeSampleId = pickActiveSingleStainId();
  }
}

function getActiveSingleStainSample() {
  return state.singleStain.samples.find((sample) => sample.id === state.singleStain.activeSampleId) ?? null;
}

function setSingleStainChannel(sampleId, stainedReferenceIndex) {
  state.singleStain.samples = state.singleStain.samples.map((sample) => {
    if (sample.id !== sampleId) return sample;
    return {
      ...sample,
      stainedReferenceIndex: Number.isFinite(stainedReferenceIndex) ? stainedReferenceIndex : null,
      inferenceConfidence: "manual",
      inferenceReason: "manual",
    };
  });
  state.singleStain.activeSampleId = sampleId;
  syncCompPairToSingleStainSample(getActiveSingleStainSample());
  refreshSingleStainListUI();
  refreshSingleStainReviewUI();
}

function selectSingleStainSample(sampleId) {
  state.singleStain.activeSampleId = sampleId;
  syncCompPairToSingleStainSample(getActiveSingleStainSample());
  refreshSingleStainListUI();
  refreshSingleStainReviewUI();
}

function setCompPairFromSingleStain(fromIndex, toIndex) {
  if (!state.comp || !state.dataset) {
    setStatusText("Load a main sample first to link single-stain plots to compensation.");
    return;
  }
  state.comp.selectedFrom = fromIndex;
  state.comp.selectedTo = toIndex;
  refreshCompUI();
  refreshCompMatrixUI();
  refreshSingleStainReviewUI();
  setStatusText(`Comp pair set: ${state.dataset.params[fromIndex]?.label ?? fromIndex} -> ${state.dataset.params[toIndex]?.label ?? toIndex}`);
}

function applyCompCoeff(fromIndex, toIndex, value, { refreshReview = true } = {}) {
  if (!state.comp) return;
  state.comp.selectedFrom = fromIndex;
  state.comp.selectedTo = toIndex;
  state.comp.setCoeff(fromIndex, toIndex, value);
  state.compRevision++;
  refreshCompUI();
  refreshCompMatrixUI();
  refreshApplyUI();
  refreshWorstPairsUI();
  updateAllPlots(state);
  if (refreshReview) refreshSingleStainReviewUI();
}

function resetCompPair(fromIndex, toIndex, { refreshReview = true } = {}) {
  if (!state.comp) return;
  state.comp.selectedFrom = fromIndex;
  state.comp.selectedTo = toIndex;
  state.comp.resetPair(fromIndex, toIndex);
  state.compRevision++;
  refreshCompUI();
  refreshCompMatrixUI();
  refreshApplyUI();
  refreshWorstPairsUI();
  updateAllPlots(state);
  if (refreshReview) refreshSingleStainReviewUI();
}

function syncCompPairToSingleStainSample(sample) {
  if (!sample || !state.comp || !state.dataset || sample.stainedReferenceIndex == null) return;
  const nextTo = sample.compParamIndices.find(
    (refIndex) => refIndex !== sample.stainedReferenceIndex && sample.referenceToSample.has(refIndex),
  );
  if (!Number.isFinite(nextTo)) return;
  state.comp.selectedFrom = sample.stainedReferenceIndex;
  state.comp.selectedTo = nextTo;
  refreshCompUI();
  refreshCompMatrixUI();
}

function refreshSingleStainListUI() {
  if (!singleStainListEl) return;
  singleStainListEl.innerHTML = "";

  if (state.singleStain.samples.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Load single-stain FCS files to build per-channel compensation review plots.";
    singleStainListEl.appendChild(empty);
    return;
  }

  const referenceParams = getReferenceParams();
  const channelIndices = state.singleStain.compParamIndices.length
    ? state.singleStain.compParamIndices
    : getCompRelevantParamIndices(referenceParams);

  for (const sample of state.singleStain.samples) {
    const item = document.createElement("div");
    item.className = "single-stain-item";
    item.classList.toggle("selected", sample.id === state.singleStain.activeSampleId);

    const fileButton = document.createElement("button");
    fileButton.type = "button";
    fileButton.className = "single-stain-file";
    fileButton.addEventListener("click", () => selectSingleStainSample(sample.id));

    const fileName = document.createElement("div");
    fileName.className = "single-stain-file-name";
    fileName.textContent = sample.fileName;

    const meta = document.createElement("div");
    meta.className = "single-stain-meta";

    const badge = document.createElement("span");
    badge.className = `single-stain-badge ${sample.inferenceConfidence === "high" ? "high" : sample.inferenceConfidence === "low" ? "low" : ""}`.trim();
    badge.textContent = sample.inferenceReason === "manual"
      ? "Manual"
      : sample.inferenceConfidence === "high"
        ? "Auto"
        : sample.inferenceReason === "unstained-file"
          ? "Unstained"
          : "Needs review";

    const stainLabel = document.createElement("span");
    stainLabel.textContent = sample.stainedReferenceIndex != null
      ? `Y: ${sample.referenceParams[sample.stainedReferenceIndex]?.label ?? "Unknown"}`
      : "Y: not set";

    meta.append(badge, stainLabel);
    fileButton.append(fileName, meta);

    const select = document.createElement("select");
    select.innerHTML = [`<option value="">Pick stained channel…</option>`, ...channelIndices.map((index) => {
      const label = sample.referenceParams[index]?.label ?? `#${index + 1}`;
      return `<option value="${index}">${label}</option>`;
    })].join("");
    select.value = sample.stainedReferenceIndex != null ? String(sample.stainedReferenceIndex) : "";
    select.addEventListener("change", () => {
      const value = select.value === "" ? null : Number(select.value);
      setSingleStainChannel(sample.id, value);
    });

    item.append(fileButton, select);
    singleStainListEl.appendChild(item);
  }
}

function refreshSingleStainReviewUI() {
  if (!singleStainSectionEl || !singleStainGridEl || !singleStainSummaryEl) return;

  if (state.singleStain.samples.length === 0) {
    singleStainSectionEl.hidden = true;
    singleStainSummaryEl.textContent = "Load single-stain FCS files to review compensation pairs.";
    singleStainGridEl.innerHTML = "";
    return;
  }

  singleStainSectionEl.hidden = false;
  const sample = getActiveSingleStainSample();
  if (!sample) {
    singleStainSummaryEl.textContent = "Pick a single-stain file.";
    singleStainGridEl.innerHTML = "";
    return;
  }

  const stainLabel = sample.stainedReferenceIndex != null
    ? sample.referenceParams[sample.stainedReferenceIndex]?.label ?? "Unknown"
    : "Not set";
  singleStainSummaryEl.textContent = `${sample.fileName} | stained: ${stainLabel} | preview: ${(sample.parsed.preview.n ?? 0).toLocaleString()} events`;

  renderSingleStainReview({
    container: singleStainGridEl,
    sample,
    currentPair: state.comp ? { from: state.comp.selectedFrom, to: state.comp.selectedTo } : null,
    getCoeff: (fromIndex, toIndex) => state.comp?.getCoeff(fromIndex, toIndex) ?? 0,
    onPickPair: setCompPairFromSingleStain,
    onChangeCoeff: (fromIndex, toIndex, value) => applyCompCoeff(fromIndex, toIndex, value, { refreshReview: false }),
  });
}


function refreshApplyUI() {
  const canApply = Boolean(state.dataset?.sourceFile && state.comp && (state.dataset.nEvents ?? 0) > 0);
  const running = state.fullApply.status === "running";
  const hasApplied = state.fullApply.status === "done";
  const upToDate = hasApplied && state.fullApply.appliedRevision === state.compRevision;

  applyAllBtn.disabled = !canApply || running;
  applyCancelBtn.hidden = !running;

  if (!canApply) {
    applyProgressEl.hidden = true;
    applyProgressTextEl.textContent = "";
    applyStatusEl.textContent = state.dataset
      ? ((state.dataset.nEvents ?? 0) > 0 ? "Load an FCS file to enable" : "No events in file")
      : "";
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
  rebindSingleStainSamples(dataset.params);
  syncCompPairToSingleStainSample(getActiveSingleStainSample());
  refreshParamUI();
  refreshCompUI();
  refreshCompMatrixUI();
  refreshWorstPairsUI();
  refreshSingleStainListUI();
  refreshSingleStainReviewUI();
  refreshApplyUI();
  setCompControlsEnabled(true);
  ensureTwoPlots();
  if (dataset.nEvents > 0) {
    setStatusText(`Loaded ${file.name} (${dataset.nEvents.toLocaleString()} events)`);
  } else {
    setStatusText(`Loaded ${file.name} (0 events: no plot points to draw)`);
  }
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
  rebindSingleStainSamples(demo.params);
  syncCompPairToSingleStainSample(getActiveSingleStainSample());
  refreshParamUI();
  refreshCompUI();
  refreshCompMatrixUI();
  refreshWorstPairsUI();
  refreshSingleStainListUI();
  refreshSingleStainReviewUI();
  refreshApplyUI();
  setCompControlsEnabled(true);
  ensureTwoPlots();
  setStatusText("Loaded demo dataset");
}

// Data drop zone
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const loadDemoBtn = document.getElementById("loadDemoBtn");
if (fileInput) fileInput.disabled = false;
if (loadDemoBtn) loadDemoBtn.disabled = false;
if (singleStainInput) singleStainInput.disabled = false;
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

async function loadSingleStainFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) return;

  const referenceParams = getReferenceParams();
  const incoming = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setStatusText(`Parsing single-stain ${i + 1}/${files.length}: ${file.name}`);
    const parsed = await parseFcsFile(await file.arrayBuffer());
    incoming.push(createSingleStainRecord(file.name, parsed, referenceParams.length ? referenceParams : parsed.params));
  }

  const byName = new Map(state.singleStain.samples.map((sample) => [sample.fileName, sample]));
  for (const sample of incoming) {
    const prev = byName.get(sample.fileName);
    if (prev && prev.inferenceReason === "manual" && prev.stainedReferenceIndex != null) {
      sample.stainedReferenceIndex = prev.stainedReferenceIndex;
      sample.inferenceConfidence = "manual";
      sample.inferenceReason = "manual";
      sample.id = prev.id;
    }
    byName.set(sample.fileName, sample);
  }

  state.singleStain.samples = [...byName.values()];
  state.singleStain.compParamIndices = getCompRelevantParamIndices(getReferenceParams());
  state.singleStain.activeSampleId = pickActiveSingleStainId();
  syncCompPairToSingleStainSample(getActiveSingleStainSample());
  refreshSingleStainListUI();
  refreshSingleStainReviewUI();

  const resolved = state.singleStain.samples.filter((sample) => sample.stainedReferenceIndex != null).length;
  setStatusText(`Loaded ${incoming.length} single-stain file(s). ${resolved}/${state.singleStain.samples.length} channel assignments ready.`);
}

if (singleStainInput) {
  singleStainInput.addEventListener("change", async () => {
    try {
      await loadSingleStainFiles(singleStainInput.files);
    } catch (err) {
      console.error(err);
      setStatusText(`Failed to load single-stain files: ${String(err?.message ?? err)}`);
    } finally {
      singleStainInput.value = "";
    }
  });
}

// Demo
if (loadDemoBtn) {
  loadDemoBtn.addEventListener("click", () => loadDemo());
}
if (themeToggleBtn) {
  refreshThemeUI();
  themeToggleBtn.addEventListener("click", () => {
    toggleTheme();
    refreshThemeUI();
    updateAllPlots(state);
    refreshSingleStainReviewUI();
  });
}

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
  refreshCompMatrixUI();
  refreshSingleStainReviewUI();
});
compTo.addEventListener("change", () => {
  if (!state.comp) return;
  state.comp.selectedTo = Number(compTo.value);
  refreshCompUI();
  refreshCompMatrixUI();
  refreshSingleStainReviewUI();
});
compSlider.addEventListener("input", () => {
  if (!state.comp) return;
  const i = state.comp.selectedFrom;
  const j = state.comp.selectedTo;
  const v = Number(compSlider.value);
  applyCompCoeff(i, j, v);
});
document.getElementById("compResetBtn").addEventListener("click", () => {
  if (!state.comp) return;
  resetCompPair(state.comp.selectedFrom, state.comp.selectedTo);
});
document.getElementById("compResetAllBtn").addEventListener("click", () => {
  if (!state.comp) return;
  state.comp.resetAll();
  state.compRevision++;
  refreshCompUI();
  refreshCompMatrixUI();
  refreshSingleStainReviewUI();
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
    refreshCompMatrixUI();
    refreshSingleStainReviewUI();
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
document.getElementById("exportCompCsvBtn").addEventListener("click", () => {
  if (!state.comp || !state.dataset) return;
  downloadCompCsv(state.comp, state.dataset.params);
});
document.getElementById("importCompCsvInput").addEventListener("change", async (e) => {
  if (!state.comp || !state.dataset) return;
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await loadCompCsvFromFile(state.comp, state.dataset.params, file);
    state.compRevision++;
    refreshCompUI();
    refreshCompMatrixUI();
    refreshSingleStainReviewUI();
    refreshApplyUI();
    refreshWorstPairsUI();
    updateAllPlots(state);
    setStatusText("Loaded compensation matrix CSV");
  } catch (err) {
    console.error(err);
    setStatusText(`Failed to load comp CSV: ${String(err?.message ?? err)}`);
  } finally {
    e.target.value = "";
  }
});
if (toggleMatrixBtn && compMatrixWrapEl) {
  toggleMatrixBtn.addEventListener("click", () => {
    const nextHidden = !compMatrixWrapEl.hidden;
    compMatrixWrapEl.hidden = nextHidden;
    toggleMatrixBtn.textContent = nextHidden ? "Show matrix" : "Hide matrix";
  });
}

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
  for (const id of [
    "compFrom",
    "compTo",
    "compSlider",
    "compResetBtn",
    "compResetAllBtn",
    "downloadCompBtn",
    "toggleMatrixBtn",
    "exportCompCsvBtn",
  ]) {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  }
  for (const id of ["uploadCompInput", "importCompCsvInput"]) {
    const upload = document.getElementById(id);
    if (upload) upload.disabled = !enabled;
  }
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
  if (!state.dataset?.sourceFile || !state.comp || (state.dataset.nEvents ?? 0) <= 0) return;
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
refreshCompMatrixUI();
refreshWorstPairsUI();
refreshSingleStainListUI();
refreshSingleStainReviewUI();
refreshGateHierarchyUI();
refreshApplyUI();
refreshThemeUI();
setCompControlsEnabled(false);
setStatusText("Drop an FCS file (or load demo) to begin.");

window.addEventListener("resize", () => refreshSingleStainReviewUI());

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
