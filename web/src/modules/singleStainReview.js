import { transformValue } from "./transforms.js";

const SCALE_PARAMS = {
  arcsinhCofactor: 150,
  logicleLinthresh: 100,
};

export function renderSingleStainReview({ container, sample, currentPair, onPickPair }) {
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

  const intro = document.createElement("div");
  intro.className = "single-stain-intro";
  intro.textContent = `Y is fixed to ${sample.referenceParams[yRef]?.label ?? "selected stain"}. Click any panel to move the manual compensation slider to that pair.`;
  container.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "single-stain-grid";
  container.appendChild(grid);

  for (const xRef of xRefs) {
    const xSample = sample.referenceToSample.get(xRef);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "single-stain-plot";
    card.classList.toggle("selected", currentPair?.from === yRef && currentPair?.to === xRef);

    const title = document.createElement("div");
    title.className = "single-stain-plot-title";
    title.textContent = `${sample.referenceParams[xRef]?.label ?? `#${xRef + 1}`} vs ${sample.referenceParams[yRef]?.label ?? `#${yRef + 1}`}`;

    const canvas = document.createElement("canvas");
    canvas.className = "single-stain-canvas";

    const footer = document.createElement("div");
    footer.className = "single-stain-plot-footer";
    footer.textContent = `Set comp: ${sample.referenceParams[yRef]?.label ?? "Y"} -> ${sample.referenceParams[xRef]?.label ?? "X"}`;

    card.append(title, canvas, footer);
    card.addEventListener("click", () => onPickPair?.(yRef, xRef));
    grid.appendChild(card);

    drawSingleStainPlot(canvas, sample, xSample, ySample);
  }
}

function drawSingleStainPlot(canvas, sample, xIndex, yIndex) {
  const n = sample.parsed.preview.n ?? 0;
  const xRaw = sample.parsed.preview.channels[xIndex] ?? new Float32Array(0);
  const yRaw = sample.parsed.preview.channels[yIndex] ?? new Float32Array(0);

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(180, Math.round(rect.width || 220));
  const height = Math.max(180, Math.round(rect.height || 220));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(6, 10, 16, 0.92)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const plotArea = {
    left: 16 * dpr,
    top: 16 * dpr,
    width: canvas.width - 32 * dpr,
    height: canvas.height - 32 * dpr,
  };

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeRect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);

  if (n <= 0) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${12 * dpr}px sans-serif`;
    ctx.fillText("0 events", plotArea.left + plotArea.width / 2, plotArea.top + plotArea.height / 2);
    return;
  }

  const xRange = computeRobustRange(xRaw, n);
  const yRange = computeRobustRange(yRaw, n);
  const xMinT = transformValue("logicle", xRange.min, SCALE_PARAMS);
  const xMaxT = transformValue("logicle", xRange.max, SCALE_PARAMS);
  const yMinT = transformValue("logicle", yRange.min, SCALE_PARAMS);
  const yMaxT = transformValue("logicle", yRange.max, SCALE_PARAMS);
  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;

  ctx.fillStyle = "rgba(110, 168, 255, 0.65)";
  const pointSize = Math.max(1, Math.round(dpr));

  for (let i = 0; i < n; i++) {
    const xv = transformValue("logicle", xRaw[i], SCALE_PARAMS);
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

function computeRobustRange(values, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
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
