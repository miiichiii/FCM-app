import { transformValue } from "./transforms.js";
import { getThemeColors } from "./theme.js";
import { getCompSliderConfig } from "./compUi.js";

const SCALE_PARAMS = {
  arcsinhCofactor: 150,
  logicleLinthresh: 100,
};

export function renderSingleStainReview({ container, sample, currentPair, getCoeff, onPickPair, onChangeCoeff, onApplyComp }) {
  const applyComp = onApplyComp ?? onChangeCoeff;
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
    // coeffYtoX: yRef→xRef spillover (used for drawing / X-axis slider)
    const coeffYtoX = Number(getCoeff?.(yRef, xRef) ?? 0);
    // coeffXtoY: xRef→yRef spillover (Y-axis slider)
    const coeffXtoY = Number(getCoeff?.(xRef, yRef) ?? 0);

    const card = document.createElement("div");
    card.className = "single-stain-plot";
    card.classList.toggle("selected", currentPair?.from === yRef && currentPair?.to === xRef);

    // ── Y-axis slider column (left of canvas): xRef→yRef spillover ──
    const ssYSliderCol = document.createElement("div");
    ssYSliderCol.className = "ss-y-slider-col";

    const cfgXtoY = getCompSliderConfig(coeffXtoY);
    const yCompSlider = document.createElement("input");
    yCompSlider.type = "range";
    yCompSlider.className = "ss-y-comp-slider";
    yCompSlider.min = String(cfgXtoY.min);
    yCompSlider.max = String(cfgXtoY.max);
    yCompSlider.step = String(cfgXtoY.step);
    yCompSlider.value = String(Math.max(cfgXtoY.min, Math.min(cfgXtoY.max, coeffXtoY)));

    const ySliderVal = document.createElement("div");
    ySliderVal.className = "ss-slider-val";
    ySliderVal.textContent = coeffXtoY.toFixed(3);

    ssYSliderCol.append(yCompSlider, ySliderVal);

    // ── キャンバス: Y ラベル(左) + canvas ────────────────────────
    const plotBody = document.createElement("div");
    plotBody.className = "ss-plot-body";

    const yLabelEl = document.createElement("div");
    yLabelEl.className = "ss-y-label";
    yLabelEl.textContent = yLabel;

    const canvas = document.createElement("canvas");
    canvas.className = "single-stain-canvas";

    plotBody.append(ssYSliderCol, yLabelEl, canvas);

    // ── X-axis control row (below canvas): yRef→xRef spillover ───
    const cfgYtoX = getCompSliderConfig(coeffYtoX);
    const xCompSlider = document.createElement("input");
    xCompSlider.type = "range";
    xCompSlider.className = "ss-x-comp-slider";
    xCompSlider.min = String(cfgYtoX.min);
    xCompSlider.max = String(cfgYtoX.max);
    xCompSlider.step = String(cfgYtoX.step);
    xCompSlider.value = String(Math.max(cfgYtoX.min, Math.min(cfgYtoX.max, coeffYtoX)));

    const xSliderVal = document.createElement("div");
    xSliderVal.className = "ss-slider-val";
    xSliderVal.textContent = coeffYtoX.toFixed(3);

    const xLabelEl = document.createElement("div");
    xLabelEl.className = "ss-x-label";
    xLabelEl.textContent = xLabel;

    const ssXCtrlRow = document.createElement("div");
    ssXCtrlRow.className = "ss-x-ctrl-row";
    ssXCtrlRow.append(xLabelEl, xCompSlider, xSliderVal);

    // 係数表示フッター
    const footer = document.createElement("div");
    footer.className = "single-stain-plot-footer";
    footer.textContent = `coeff: ${coeffYtoX.toFixed(3)}`;

    // カードクリックでペアを選択（スライダークリックは伝播させない）
    card.addEventListener("click", () => onPickPair?.(yRef, xRef));
    card.style.cursor = "pointer";
    yCompSlider.addEventListener("click", (e) => e.stopPropagation());
    xCompSlider.addEventListener("click", (e) => e.stopPropagation());

    // Y スライダー: xRef→yRef (キャンバスをリアルタイム更新)
    yCompSlider.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = Number(yCompSlider.value);
      ySliderVal.textContent = v.toFixed(3);
      drawSingleStainPlot(canvas, sample, xSample, ySample, Number(xCompSlider.value), v);
      applyComp?.(xRef, yRef, v);
    });

    // X スライダー: yRef→xRef (キャンバスをリアルタイム更新)
    xCompSlider.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = Number(xCompSlider.value);
      xSliderVal.textContent = v.toFixed(3);
      footer.textContent = `coeff: ${v.toFixed(3)}`;
      drawSingleStainPlot(canvas, sample, xSample, ySample, v, Number(yCompSlider.value));
      applyComp?.(yRef, xRef, v);
    });

    card.append(plotBody, ssXCtrlRow, footer);
    grid.appendChild(card);

    drawSingleStainPlot(canvas, sample, xSample, ySample, coeffYtoX, coeffXtoY);
  }
}

function drawSingleStainPlot(canvas, sample, xIndex, yIndex, coeff, coeffXtoY = 0) {
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
  const yRange = computeRobustRange(yRaw, xRaw, n, coeffXtoY, true);
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
    const yComp = yRaw[i] - coeffXtoY * xRaw[i];
    const xv = transformValue("logicle", xComp, SCALE_PARAMS);
    const yv = transformValue("logicle", yComp, SCALE_PARAMS);
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

function createEmptyState(text) {
  const el = document.createElement("div");
  el.className = "single-stain-empty";
  el.textContent = text;
  return el;
}


