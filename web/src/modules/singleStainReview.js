import { transformValue } from "./transforms.js";
import { getThemeColors } from "./theme.js";
import { COMP_INPUT_STEP, COMP_NUDGE_STEP, clampCompSliderValue, getCompSliderConfig, parseCompInput } from "./compUi.js";

const SCALE_PARAMS = {
  arcsinhCofactor: 150,
  logicleLinthresh: 100,
};

export function renderSingleStainReview({ container, sample, currentPair, getCoeff, onPickPair, onChangeCoeff }) {
  container.innerHTML = "";
  if (!sample) return;

  const yRef = sample.stainedReferenceIndex;
  if (yRef == null) {
    container.appendChild(createEmptyState("Pick a stained channel to review this file."));
    return;
  }

  const ySample = sample.referenceToSample.get(yRef);
  if (ySample == null) {
    container.appendChild(createEmptyState("The stained channel was not found in this file."));
    return;
  }

  const xRefs = sample.compParamIndices.filter((refIndex) => refIndex !== yRef && sample.referenceToSample.has(refIndex));
  if (xRefs.length === 0) {
    container.appendChild(createEmptyState("No compensation channels were found for this sample."));
    return;
  }

  const yLabel = sample.referenceParams[yRef]?.label ?? "selected stain";
  const intro = document.createElement("div");
  intro.className = "single-stain-intro";
  intro.textContent = `Y is fixed to ${yLabel}. Each slider applies X - (${yLabel} x coef) and stays synced with manual compensation.`;
  container.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "single-stain-grid";
  container.appendChild(grid);

  for (const xRef of xRefs) {
    const xSample = sample.referenceToSample.get(xRef);
    const xLabel = sample.referenceParams[xRef]?.label ?? `#${xRef + 1}`;
    const coeff = Number(getCoeff?.(yRef, xRef) ?? 0);

    const card = document.createElement("div");
    card.className = "single-stain-plot";
    card.classList.toggle("selected", currentPair?.from === yRef && currentPair?.to === xRef);

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "single-stain-focus";
    previewButton.addEventListener("click", () => onPickPair?.(yRef, xRef));

    const title = document.createElement("div");
    title.className = "single-stain-plot-title";
    title.textContent = `${xLabel} vs ${yLabel}`;

    const canvas = document.createElement("canvas");
    canvas.className = "single-stain-canvas";

    const footer = document.createElement("div");
    footer.className = "single-stain-plot-footer";
    footer.textContent = `Manual pair: ${yLabel} -> ${xLabel}`;

    previewButton.append(title, canvas, footer);

    const controls = document.createElement("div");
    controls.className = "single-stain-slider-wrap";

    const controlsHeader = document.createElement("div");
    controlsHeader.className = "single-stain-slider-header";

    const controlsLabel = document.createElement("div");
    controlsLabel.className = "single-stain-slider-label";
    controlsLabel.textContent = `${xLabel} - (${yLabel} x coef)`;

    const valueEl = document.createElement("div");
    valueEl.className = "mono single-stain-slider-value";
    valueEl.textContent = coeff.toFixed(3);

    controlsHeader.append(controlsLabel, valueEl);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "single-stain-slider";
    applySliderConfig(slider, coeff);

    const editRow = document.createElement("div");
    editRow.className = "single-stain-edit-row";

    const downBtn = createAdjustButton("-0.01", -COMP_NUDGE_STEP);
    const upBtn = createAdjustButton("+0.01", COMP_NUDGE_STEP);

    const input = document.createElement("input");
    input.type = "number";
    input.step = String(COMP_INPUT_STEP);
    input.className = "single-stain-number";
    input.value = coeff.toFixed(3);

    const applyValue = (next) => {
      valueEl.textContent = next.toFixed(3);
      input.value = next.toFixed(3);
      applySliderConfig(slider, next);
      slider.value = String(clampCompSliderValue(next, getCompSliderConfig(next)));
      drawSingleStainPlot(canvas, sample, xSample, ySample, next);
      onChangeCoeff?.(yRef, xRef, next);
    };

    slider.addEventListener("input", () => {
      applyValue(Number(slider.value));
    });

    input.addEventListener("change", () => {
      applyValue(parseCompInput(input.value, coeff));
    });

    downBtn.addEventListener("click", () => applyValue(parseCompInput(input.value, coeff) - COMP_NUDGE_STEP));
    upBtn.addEventListener("click", () => applyValue(parseCompInput(input.value, coeff) + COMP_NUDGE_STEP));

    editRow.append(downBtn, input, upBtn);
    controls.append(controlsHeader, slider, editRow);
    card.append(previewButton, controls);
    grid.appendChild(card);

    drawSingleStainPlot(canvas, sample, xSample, ySample, coeff);
  }
}

function drawSingleStainPlot(canvas, sample, xIndex, yIndex, coeff) {
  const n = sample.parsed.preview.n ?? 0;
  const xRaw = sample.parsed.preview.channels[xIndex] ?? new Float32Array(0);
  const yRaw = sample.parsed.preview.channels[yIndex] ?? new Float32Array(0);
  const theme = getThemeColors();

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(180, Math.round(rect.width || 220));
  const height = Math.max(180, Math.round(rect.height || 220));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = theme.plotCanvasBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const plotArea = {
    left: 16 * dpr,
    top: 16 * dpr,
    width: canvas.width - 32 * dpr,
    height: canvas.height - 32 * dpr,
  };

  ctx.strokeStyle = theme.plotFrame;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeRect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);

  if (n <= 0) {
    ctx.fillStyle = theme.plotText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${12 * dpr}px sans-serif`;
    ctx.fillText("0 events", plotArea.left + plotArea.width / 2, plotArea.top + plotArea.height / 2);
    return;
  }

  const xRange = computeRobustRange(xRaw, yRaw, n, coeff, true);
  const yRange = computeRobustRange(yRaw, yRaw, n, 0, false);
  const xMinT = transformValue("logicle", xRange.min, SCALE_PARAMS);
  const xMaxT = transformValue("logicle", xRange.max, SCALE_PARAMS);
  const yMinT = transformValue("logicle", yRange.min, SCALE_PARAMS);
  const yMaxT = transformValue("logicle", yRange.max, SCALE_PARAMS);
  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;

  ctx.fillStyle = theme.reviewPoint;
  const pointSize = Math.max(1, Math.round(dpr));

  for (let i = 0; i < n; i++) {
    const xComp = xRaw[i] - coeff * yRaw[i];
    const xv = transformValue("logicle", xComp, SCALE_PARAMS);
    const yv = transformValue("logicle", yRaw[i], SCALE_PARAMS);
    const nx = (xv - xMinT) / denomX;
    const ny = (yv - yMinT) / denomY;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
    const px = plotArea.left + nx * plotArea.width;
    const py = plotArea.top + (1 - ny) * plotArea.height;
    ctx.fillRect(px, py, pointSize, pointSize);
  }
}

function computeRobustRange(primaryValues, secondaryValues, n, coeff, applyComp) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const base = primaryValues[i];
    const v = applyComp ? base - coeff * secondaryValues[i] : base;
    if (Number.isFinite(v)) list.push(v);
  }

  if (list.length === 0) return { min: 0, max: 1 };

  list.sort((a, b) => a - b);
  const low = list[Math.max(0, Math.floor((list.length - 1) * 0.01))];
  const high = list[Math.max(0, Math.floor((list.length - 1) * 0.995))];

  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) {
    const pivot = Number.isFinite(low) ? low : 0;
    return { min: pivot - 1, max: pivot + 1 };
  }

  const pad = (high - low) * 0.08;
  return { min: low - pad, max: high + pad };
}

function applySliderConfig(slider, value) {
  const config = getCompSliderConfig(value);
  slider.min = String(config.min);
  slider.max = String(config.max);
  slider.step = String(config.step);
}

function createEmptyState(text) {
  const el = document.createElement("div");
  el.className = "single-stain-empty";
  el.textContent = text;
  return el;
}

function createAdjustButton(label, delta) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-secondary single-stain-nudge";
  button.textContent = label;
  button.dataset.delta = String(delta);
  return button;
}
