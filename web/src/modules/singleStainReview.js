import { transformValue } from "./transforms.js";
import { getThemeColors } from "./theme.js";
import { getCompSliderConfig } from "./compUi.js";

const SCALE_PARAMS = {
  arcsinhCofactor: 150,
  logicleLinthresh: 100,
};

export function renderSingleStainReview({ container, sample, currentPair, getCoeff, getPreviewValue, onPickPair, onChangeCoeff, onApplyComp }) {
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
  intro.textContent = `Y axis is ${yLabel}. Plots use the current global compensation matrix, so changing one pair can shift other linked panels too.`;
  container.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "single-stain-grid";
  container.appendChild(grid);

  // Registry: all card redraw functions share access to the global getCoeff
  // so that when one slider moves the entire panel reflects current comp state.
  const redrawAll = [];
  let pendingApply = null;
  let applyFrame = 0;

  function scheduleCompUpdate(fromRef, toRef, value) {
    pendingApply = { fromRef, toRef, value };
    if (applyFrame) return;
    applyFrame = requestAnimationFrame(() => {
      applyFrame = 0;
      const next = pendingApply;
      pendingApply = null;
      if (!next) return;
      try { applyComp?.(next.fromRef, next.toRef, next.value); } catch (_) {}
      for (const fn of redrawAll) fn();
    });
  }

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

    // 全カード一斉再描画: getCoeff から現在の係数を読み直して描画する
    // drawSingleStainPlot(canvas, sample, xIndex, yIndex, coeff=yRef→xRef, coeffXtoY=xRef→yRef)
    function makeRedraw(cv, smp, xr, yr, xs, ys, xl, yl, xsl, ysl, xsv, ysv, ftEl) {
      return function redrawCard() {
        const cx = Number(getCoeff?.(yr, xr) ?? 0); // yRef→xRef (X slider value)
        const cy = Number(getCoeff?.(xr, yr) ?? 0); // xRef→yRef (Y slider value)
        // スライダー表示を最新の係数に同期
        xsl.value = String(Math.max(Number(xsl.min), Math.min(Number(xsl.max), cx)));
        ysl.value = String(Math.max(Number(ysl.min), Math.min(Number(ysl.max), cy)));
        xsv.textContent = cx.toFixed(3);
        ysv.textContent = cy.toFixed(3);
        ftEl.textContent = `coeff: ${cx.toFixed(3)}`;
        drawSingleStainPlot(cv, smp, xs, ys, cx, cy, xl, yl, getPreviewValue);
      };
    }
    const redrawThisCard = makeRedraw(
      canvas, sample, xRef, yRef, xSample, ySample, xLabel, yLabel,
      xCompSlider, yCompSlider, xSliderVal, ySliderVal, footer,
    );
    redrawAll.push(redrawThisCard);

    // Y スライダー: xRef→yRef (キャンバスをリアルタイム更新)
    yCompSlider.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = Number(yCompSlider.value);
      ySliderVal.textContent = v.toFixed(3);
      scheduleCompUpdate(xRef, yRef, v);
    });

    // X スライダー: yRef→xRef (キャンバスをリアルタイム更新)
    xCompSlider.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = Number(xCompSlider.value);
      xSliderVal.textContent = v.toFixed(3);
      footer.textContent = `coeff: ${v.toFixed(3)}`;
      scheduleCompUpdate(yRef, xRef, v);
    });

    card.append(plotBody, ssXCtrlRow, footer);
    grid.appendChild(card);

    drawSingleStainPlot(canvas, sample, xSample, ySample, coeffYtoX, coeffXtoY, xLabel, yLabel, getPreviewValue);
  }
}

function drawSingleStainPlot(canvas, sample, xIndex, yIndex, coeff, coeffXtoY = 0, xLabel = "", yLabel = "", getPreviewValue = null) {
  const n = sample.parsed.preview.n ?? 0;
  const rawChannels = sample.parsed.preview.channels;
  const xRaw = rawChannels[xIndex] ?? new Float32Array(0);
  const yRaw = rawChannels[yIndex] ?? new Float32Array(0);
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

  const SS_LEFT = 48, SS_TOP = 10, SS_RIGHT = 8, SS_BOTTOM = 36;
  const plotArea = {
    left: SS_LEFT * dpr,
    top: SS_TOP * dpr,
    width: canvas.width - (SS_LEFT + SS_RIGHT) * dpr,
    height: canvas.height - (SS_TOP + SS_BOTTOM) * dpr,
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

  const xValues = new Float64Array(n);
  const yValues = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xValues[i] = typeof getPreviewValue === "function"
      ? getPreviewValue(xIndex, i, rawChannels)
      : xRaw[i] - coeff * yRaw[i];
    yValues[i] = typeof getPreviewValue === "function"
      ? getPreviewValue(yIndex, i, rawChannels)
      : yRaw[i] - coeffXtoY * xRaw[i];
  }

  const xRange = computeRobustRange(xValues);
  const yRange = computeRobustRange(yValues);
  const xMinT = transformValue("logicle", xRange.min, SCALE_PARAMS);
  const xMaxT = transformValue("logicle", xRange.max, SCALE_PARAMS);
  const yMinT = transformValue("logicle", yRange.min, SCALE_PARAMS);
  const yMaxT = transformValue("logicle", yRange.max, SCALE_PARAMS);
  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;

  ctx.fillStyle = theme.reviewPoint;
  const pointSize = Math.max(1, Math.round(dpr));

  for (let i = 0; i < n; i++) {
    const xv = transformValue("logicle", xValues[i], SCALE_PARAMS);
    const yv = transformValue("logicle", yValues[i], SCALE_PARAMS);
    const nx = (xv - xMinT) / denomX;
    const ny = (yv - yMinT) / denomY;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
    const px = plotArea.left + nx * plotArea.width;
    const py = plotArea.top + (1 - ny) * plotArea.height;
    ctx.fillRect(px, py, pointSize, pointSize);
  }

  // Axis ticks and labels
  drawSSAxisTicks(ctx, plotArea, xRange, yRange, dpr, theme, xLabel, yLabel, SS_LEFT);
}

function computeRobustRange(values) {
  const list = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
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

// ── Axis tick helpers (mirrors plotCard.js) ───────────────────────
function drawSSAxisTicks(ctx, plotArea, xRange, yRange, dpr, theme, xLabel, yLabel, leftMarginPx = 48) {
  const xMinT = transformValue("logicle", xRange.min, SCALE_PARAMS);
  const xMaxT = transformValue("logicle", xRange.max, SCALE_PARAMS);
  const yMinT = transformValue("logicle", yRange.min, SCALE_PARAMS);
  const yMaxT = transformValue("logicle", yRange.max, SCALE_PARAMS);
  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;
  const right  = plotArea.left + plotArea.width;
  const bottom = plotArea.top  + plotArea.height;

  ctx.save();
  ctx.fillStyle   = theme.plotText ?? "rgba(66,53,39,0.75)";
  ctx.strokeStyle = theme.plotText ?? "rgba(66,53,39,0.75)";
  ctx.globalAlpha = 0.85;
  const fs = Math.max(7, Math.round(8 * dpr));
  ctx.font = `${fs}px ui-monospace,monospace`;

  // X-axis ticks
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  const xTicks = computeSSTicks(xRange.min, xRange.max, 4);
  for (const v of xTicks) {
    const t  = transformValue("logicle", v, SCALE_PARAMS);
    const nx = (t - xMinT) / denomX;
    if (nx < 0.02 || nx > 0.98) continue;
    const px = plotArea.left + nx * plotArea.width;
    ctx.beginPath();
    ctx.moveTo(px, bottom);
    ctx.lineTo(px, bottom + 4 * dpr);
    ctx.lineWidth = Math.max(1, dpr * 0.8);
    ctx.stroke();
    ctx.fillText(fmtSSTick(v), px, bottom + 5 * dpr);
  }

  // Y-axis ticks
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  const yTicks = computeSSTicks(yRange.min, yRange.max, 4);
  for (const v of yTicks) {
    const t  = transformValue("logicle", v, SCALE_PARAMS);
    const ny = (t - yMinT) / denomY;
    if (ny < 0.03 || ny > 0.97) continue;
    const py = plotArea.top + (1 - ny) * plotArea.height;
    ctx.beginPath();
    ctx.moveTo(plotArea.left, py);
    ctx.lineTo(plotArea.left - 4 * dpr, py);
    ctx.lineWidth = Math.max(1, dpr * 0.8);
    ctx.stroke();
    ctx.fillText(fmtSSTick(v), plotArea.left - 6 * dpr, py);
  }

  // X-axis title
  if (xLabel) {
    ctx.save();
    ctx.font = `bold ${Math.max(8, Math.round(9 * dpr))}px sans-serif`;
    ctx.globalAlpha = 0.9;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.fillText(xLabel, plotArea.left + plotArea.width / 2, bottom + 18 * dpr);
    ctx.restore();
  }

  // Y-axis title (rotated)
  if (yLabel) {
    ctx.save();
    ctx.font = `bold ${Math.max(8, Math.round(9 * dpr))}px sans-serif`;
    ctx.globalAlpha = 0.9;
    const yTitleX = Math.max(8, (leftMarginPx - 32)) * dpr;
    ctx.translate(yTitleX, plotArea.top + plotArea.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function computeSSTicks(min, max, n) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [];
  // logicle: use 0 + powers of 10
  const ticks = [];
  if (min < 0) {
    const startExp = Math.floor(Math.log10(-min));
    for (let e = startExp; e >= 0; e--) {
      const v = -Math.pow(10, e);
      if (v >= min * 1.01) ticks.push(v);
    }
  }
  if (min <= 0 && 0 <= max) ticks.push(0);
  const posStart = Math.max(0, Math.floor(Math.log10(Math.max(1, min))));
  const posEnd   = Math.ceil(Math.log10(Math.max(1, max)));
  for (let e = posStart; e <= posEnd && ticks.length < n + 3; e++) {
    const v = Math.pow(10, e);
    if (v >= min * 0.99 && v <= max * 1.01) ticks.push(v);
  }
  if (ticks.length < 2) {
    const range = max - min;
    const rough = range / n;
    const exp   = Math.floor(Math.log10(rough || 1));
    const base  = Math.pow(10, exp);
    const m     = rough / base;
    let step = m < 1.5 ? base : m < 3.5 ? 2 * base : m < 7.5 ? 5 * base : 10 * base;
    const start = Math.ceil(min / step) * step;
    for (let v = start; v <= max * 1.001 && ticks.length < n + 2; v += step) {
      ticks.push(parseFloat(v.toPrecision(8)));
    }
  }
  return ticks;
}

const SS_SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function toSSSup(n) {
  return String(n).split("").map(c => (c === "-" ? "⁻" : SS_SUP[c]) ?? c).join("");
}
function fmtSSTick(v) {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 100) {
    const exp = Math.log10(abs);
    if (Math.abs(exp - Math.round(exp)) < 0.01) {
      return `${sign}10${toSSSup(Math.round(exp))}`;
    }
  }
  if (abs >= 1e4) return sign + (abs / 1000).toFixed(0) + "k";
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + "k";
  if (abs >= 100) return String(Math.round(v));
  if (abs >= 1)   return String(Math.round(v * 10) / 10);
  if (abs >= 0.1) return v.toPrecision(1);
  return v.toExponential(0);
}
