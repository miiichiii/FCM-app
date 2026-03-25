import { updateAllPlots } from "../state.js";
import { transformValue } from "./transforms.js";
import { gateFromPixelRect, gateToPixelRect, addGate, getGateById, getGateAncestors } from "./gate.js";
import { getThemeColors } from "./theme.js";

export function createPlotCard(state, plot, onActivate) {
  const el = document.createElement("div");
  el.className = "plot-card";

  // ── ヘッダー: Scale / Mode / Range / Remove のみ ────────────────
  const header = document.createElement("div");
  header.className = "plot-header";

  const scaleSel = document.createElement("select");
  scaleSel.innerHTML = `
    <option value="linear">Linear</option>
    <option value="logicle">Logicle</option>
    <option value="arcsinh">Arcsinh</option>
  `;
  const modeSel = document.createElement("select");
  modeSel.innerHTML = `
    <option value="scatter">Scatter</option>
    <option value="density">Density</option>
  `;

  const rangeToggleBtn = document.createElement("button");
  rangeToggleBtn.className = "btn btn-secondary";
  rangeToggleBtn.textContent = "Range ▸";

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-secondary";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove plot";

  header.append(wrapField("Scale", scaleSel), wrapField("Mode", modeSel), rangeToggleBtn, removeBtn);

  // ── プロット本体: Y軸select ＋ キャンバス ──────────────────────
  const plotBody = document.createElement("div");
  plotBody.className = "plot-body";

  // Y軸選択（左側・縦回転）
  const yAxisEl = document.createElement("div");
  yAxisEl.className = "plot-axis-y";
  const ySel = document.createElement("select");
  ySel.className = "axis-select axis-select-y";
  yAxisEl.append(ySel);

  // キャンバスエリア
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "plot-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  const overlay = document.createElement("div");
  overlay.className = "plot-overlay";
  const overlayLeft = document.createElement("div");
  const overlayRight = document.createElement("div");
  overlay.append(overlayLeft, overlayRight);
  canvasWrap.append(canvas, overlay);

  plotBody.append(yAxisEl, canvasWrap);

  // ── X軸選択（キャンバス下部・中央）────────────────────────────
  const xAxisEl = document.createElement("div");
  xAxisEl.className = "plot-axis-x";
  const xSel = document.createElement("select");
  xSel.className = "axis-select axis-select-x";
  xAxisEl.append(xSel);

  // ── Range パネル（クリックで展開）──────────────────────────────
  const rangePanel = document.createElement("div");
  rangePanel.className = "plot-range-panel";
  rangePanel.hidden = true;

  // xMin / xMax スライダー行
  const { row: xRangeRow, minInput: xMinInput, maxInput: xMaxInput,
          minSlider: xMinSlider, maxSlider: xMaxSlider } = createRangeRow("X");
  // yMin / yMax スライダー行
  const { row: yRangeRow, minInput: yMinInput, maxInput: yMaxInput,
          minSlider: yMinSlider, maxSlider: yMaxSlider } = createRangeRow("Y");

  const autoBtn = document.createElement("button");
  autoBtn.className = "btn btn-secondary";
  autoBtn.textContent = "Auto";
  autoBtn.title = "Auto range";

  rangePanel.append(xRangeRow, yRangeRow, autoBtn);

  el.append(header, plotBody, xAxisEl, rangePanel);

  // ── イベント: アクティブ選択 ────────────────────────────────────
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (state.activePlotId === plot.id) return;
    onActivate?.();
  });

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.plots = state.plots.filter((p) => p.id !== plot.id);
    state.plotCards.delete(plot.id);
    el.remove();
    if (state.activePlotId === plot.id) state.activePlotId = state.plots[0]?.id ?? null;
    updateAllPlots(state);
  });

  // Range パネル開閉
  rangeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    rangePanel.hidden = !rangePanel.hidden;
    rangeToggleBtn.textContent = rangePanel.hidden ? "Range ▸" : "Range ▾";
    if (!rangePanel.hidden) syncRangeUI();
  });

  // ── 軸 select ────────────────────────────────────────────────────
  xSel.addEventListener("change", () => { plot.xParam = Number(xSel.value); updateAllPlots(state); });
  ySel.addEventListener("change", () => { plot.yParam = Number(ySel.value); updateAllPlots(state); });
  scaleSel.addEventListener("change", () => { plot.scale = scaleSel.value; updateAllPlots(state); });
  modeSel.addEventListener("change", () => { plot.mode = modeSel.value; updateAllPlots(state); });

  // ── Range スライダー & 数値入力の同期 ────────────────────────────
  function syncRangeUI() {
    // 現在のデータ範囲から自動レンジを取得
    const raw = state.dataset?.preview?.channels;
    const n   = state.dataset?.preview?.n ?? 0;
    const comp = state.comp;
    const auto = raw ? computeAxisRanges({ plot, raw, n, comp }) : { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const xMin = plot.xMin ?? auto.xMin;
    const xMax = plot.xMax ?? auto.xMax;
    const yMin = plot.yMin ?? auto.yMin;
    const yMax = plot.yMax ?? auto.yMax;

    // スライダー範囲をデータ幅の3倍に設定
    const xSpan = Math.abs(auto.xMax - auto.xMin) || 1;
    const ySpan = Math.abs(auto.yMax - auto.yMin) || 1;

    setSliderRange(xMinSlider, auto.xMin - xSpan, auto.xMax, xMin);
    setSliderRange(xMaxSlider, auto.xMin, auto.xMax + xSpan, xMax);
    setSliderRange(yMinSlider, auto.yMin - ySpan, auto.yMax, yMin);
    setSliderRange(yMaxSlider, auto.yMin, auto.yMax + ySpan, yMax);

    xMinInput.value = plot.xMin != null ? xMin.toFixed(1) : "";
    xMaxInput.value = plot.xMax != null ? xMax.toFixed(1) : "";
    yMinInput.value = plot.yMin != null ? yMin.toFixed(1) : "";
    yMaxInput.value = plot.yMax != null ? yMax.toFixed(1) : "";
  }

  function setSliderRange(slider, min, max, val) {
    slider.min  = String(min);
    slider.max  = String(max);
    slider.step = String((max - min) / 200);
    slider.value = String(Math.max(min, Math.min(max, val)));
  }

  function applyRange() {
    plot.xMin = toNumberOrNull(xMinInput.value);
    plot.xMax = toNumberOrNull(xMaxInput.value);
    plot.yMin = toNumberOrNull(yMinInput.value);
    plot.yMax = toNumberOrNull(yMaxInput.value);
    updateAllPlots(state);
  }

  // スライダー → 数値入力 → 適用
  xMinSlider.addEventListener("input", () => { xMinInput.value = Number(xMinSlider.value).toFixed(1); plot.xMin = Number(xMinSlider.value); updateAllPlots(state); });
  xMaxSlider.addEventListener("input", () => { xMaxInput.value = Number(xMaxSlider.value).toFixed(1); plot.xMax = Number(xMaxSlider.value); updateAllPlots(state); });
  yMinSlider.addEventListener("input", () => { yMinInput.value = Number(yMinSlider.value).toFixed(1); plot.yMin = Number(yMinSlider.value); updateAllPlots(state); });
  yMaxSlider.addEventListener("input", () => { yMaxInput.value = Number(yMaxSlider.value).toFixed(1); plot.yMax = Number(yMaxSlider.value); updateAllPlots(state); });

  // 数値入力 → 適用
  for (const inp of [xMinInput, xMaxInput, yMinInput, yMaxInput]) {
    inp.addEventListener("change", applyRange);
  }

  autoBtn.addEventListener("click", () => {
    plot.xMin = null; plot.xMax = null;
    plot.yMin = null; plot.yMax = null;
    syncRangeUI();
    updateAllPlots(state);
  });

  // ── Gate drawing ────────────────────────────────────────────────
  let dragging = null;
  let lastGeom = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!state.gatingArmed) return;
    if (state.activePlotId !== plot.id) return;
    if (!lastGeom) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = toCanvasPoint(canvas, e);
    dragging = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    render();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const pt = toCanvasPoint(canvas, e);
    dragging.x1 = pt.x; dragging.y1 = pt.y;
    render();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    const pt = toCanvasPoint(canvas, e);
    dragging.x1 = pt.x; dragging.y1 = pt.y;
    const dx = Math.abs(dragging.x1 - dragging.x0);
    const dy = Math.abs(dragging.y1 - dragging.y0);
    if (dx >= 4 && dy >= 4) {
      const gateDef = gateFromPixelRect({ plot, pixelRect: dragging, plotArea: lastGeom.plotArea, axisRanges: lastGeom.axisRanges, scaleParams: lastGeom.scaleParams });
      addGate(state, gateDef);
    }
    dragging = null;
    render();
  });

  const ro = new ResizeObserver(() => render());
  ro.observe(canvasWrap);

  const densityCanvas = document.createElement("canvas");
  densityCanvas.width = 128;
  densityCanvas.height = 128;
  const densityCtx = densityCanvas.getContext("2d");

  // ── render ──────────────────────────────────────────────────────
  function render() {
    const active = state.activePlotId === plot.id;
    el.classList.toggle("active", active);

    const dataset = state.dataset;
    if (!dataset) {
      overlayLeft.textContent = "No data";
      overlayRight.textContent = "";
      clearCanvas(canvas);
      return;
    }

    const params = dataset.params;
    // 軸 select の選択肢を更新
    const opts = params.map((p, i) => `<option value="${i}">${p.label}</option>`).join("");
    xSel.innerHTML = opts;
    ySel.innerHTML = opts;
    xSel.value = String(plot.xParam);
    ySel.value = String(plot.yParam);
    scaleSel.value = plot.scale;
    modeSel.value = plot.mode;

    const dpi = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const w = Math.max(1, Math.floor(cssW * dpi));
    const h = Math.max(1, Math.floor(cssH * dpi));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const theme = getThemeColors();

    const plotArea = {
      left: 10 * dpi,
      top: 10 * dpi,
      width: w - 20 * dpi,
      height: h - 20 * dpi,
    };

    const scaleParams = {
      arcsinhCofactor: plot.arcsinhCofactor,
      logicleLinthresh: plot.logicleLinthresh,
    };

    const raw = dataset.preview.channels;
    const n = dataset.preview.n;
    const comp = state.comp;

    const axisRanges = computeAxisRanges({ plot, raw, n, comp });
    lastGeom = { plotArea, axisRanges, scaleParams };

    const xMinT = transformValue(plot.scale, axisRanges.xMin, scaleParams);
    const xMaxT = transformValue(plot.scale, axisRanges.xMax, scaleParams);
    const yMinT = transformValue(plot.scale, axisRanges.yMin, scaleParams);
    const yMaxT = transformValue(plot.scale, axisRanges.yMax, scaleParams);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.plotCanvasBg;
    ctx.fillRect(0, 0, w, h);

    // Axes frame
    ctx.strokeStyle = theme.plotFrame;
    ctx.lineWidth = Math.max(1, dpi);
    ctx.strokeRect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);

    const selectedGate = getGateById(state, state.selectedGateId);
    const gateChain = selectedGate ? [selectedGate, ...getGateAncestors(state, selectedGate.id)] : [];
    const gateDefs = gateChain.map(g => g.definition).filter(Boolean);

    let usedN = 0;
    let totalN = n;

    if (plot.mode === "density") {
      const canUseFull = state.fullApply.status === "done" && state.fullApply.appliedRevision === state.compRevision;
      if (canUseFull) {
        const key = `${plot.xParam}-${plot.yParam}-${plot.scale}-${axisRanges.xMin}-${axisRanges.xMax}-${axisRanges.yMin}-${axisRanges.yMax}-${gateChain.map(g=>g.id).join(',')}`;
        const cached = state.density.cacheByPlotId.get(plot.id);
        const pending = state.density.pendingByPlotId.get(plot.id);

        if (cached && cached.key === key) {
          totalN = cached.total;
          usedN = cached.nPassed;
          if (densityCtx) {
            const img = densityCtx.createImageData(cached.width, cached.height);
            const out = img.data;
            const denom = Math.log(1 + cached.maxCount);
            for (let i = 0; i < cached.counts.length; i++) {
              const c = cached.counts[i];
              const t = denom > 0 ? Math.log(1 + c) / denom : 0;
              const [r, g, b, a] = densityColor(t, theme);
              const o = i * 4;
              out[o]=r; out[o+1]=g; out[o+2]=b; out[o+3]=a;
            }
            densityCtx.putImageData(img, 0, 0);
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(densityCanvas, plotArea.left, plotArea.top, plotArea.width, plotArea.height);
            ctx.restore();
          }
        } else {
          if (!pending || pending.key !== key) {
            const requestId = state.density.nextRequestId++;
            state.density.pendingByPlotId.set(plot.id, { requestId, key });
            state.fullWorker.postMessage({ type: "density", requestId, plotId: plot.id, key, xParam: plot.xParam, yParam: plot.yParam, scale: plot.scale, axisRanges, scaleParams, gates: gateDefs, binsW: densityCanvas.width, binsH: densityCanvas.height });
          }
          ctx.fillStyle = theme.plotLoading;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${14 * dpi}px sans-serif`;
          ctx.fillText("Loading full density…", plotArea.left + plotArea.width / 2, plotArea.top + plotArea.height / 2);
          totalN = state.dataset.nEvents;
          usedN = 0;
        }
      } else {
        const binsW = densityCanvas.width;
        const binsH = densityCanvas.height;
        const counts = new Uint32Array(binsW * binsH);
        let maxCount = 0;

        for (let k = 0; k < n; k++) {
          if (comp && !comp.gatePasses(k, raw, gateDefs)) continue;
          const xv = comp ? comp.applyPreviewValue(plot.xParam, k, raw) : raw[plot.xParam][k];
          const yv = comp ? comp.applyPreviewValue(plot.yParam, k, raw) : raw[plot.yParam][k];
          const xt = transformValue(plot.scale, xv, scaleParams);
          const yt = transformValue(plot.scale, yv, scaleParams);
          const nx = (xt - xMinT) / (xMaxT - xMinT);
          const ny = (yt - yMinT) / (yMaxT - yMinT);
          if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
          if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
          const bx = clampInt(Math.floor(nx * binsW), 0, binsW - 1);
          const by = clampInt(binsH - 1 - Math.floor(ny * binsH), 0, binsH - 1);
          const c = ++counts[by * binsW + bx];
          if (c > maxCount) maxCount = c;
          usedN++;
        }

        if (densityCtx) {
          const img = densityCtx.createImageData(binsW, binsH);
          const out = img.data;
          const denom = Math.log(1 + maxCount);
          for (let i = 0; i < counts.length; i++) {
            const t = denom > 0 ? Math.log(1 + counts[i]) / denom : 0;
            const [r, g, b, a] = densityColor(t, theme);
            const o = i * 4;
            out[o]=r; out[o+1]=g; out[o+2]=b; out[o+3]=a;
          }
          densityCtx.putImageData(img, 0, 0);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(densityCanvas, plotArea.left, plotArea.top, plotArea.width, plotArea.height);
          ctx.restore();
        }
      }
    } else {
      ctx.fillStyle = theme.plotPoint;
      for (let k = 0; k < n; k++) {
        if (comp && !comp.gatePasses(k, raw, gateDefs)) continue;
        const xv = comp ? comp.applyPreviewValue(plot.xParam, k, raw) : raw[plot.xParam][k];
        const yv = comp ? comp.applyPreviewValue(plot.yParam, k, raw) : raw[plot.yParam][k];
        const xt = transformValue(plot.scale, xv, scaleParams);
        const yt = transformValue(plot.scale, yv, scaleParams);
        const px = plotArea.left + ((xt - xMinT) / (xMaxT - xMinT)) * plotArea.width;
        const py = plotArea.top + (1 - (yt - yMinT) / (yMaxT - yMinT)) * plotArea.height;
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        if (px < plotArea.left || px > plotArea.left + plotArea.width) continue;
        if (py < plotArea.top || py > plotArea.top + plotArea.height) continue;
        ctx.fillRect(px, py, Math.max(1, dpi), Math.max(1, dpi));
        usedN++;
      }
    }

    // Gate overlays
    for (const gate of gateChain) {
      if (!gate.definition) continue;
      const gateRect = gateToPixelRect({ gate: gate.definition, plot, plotArea, axisRanges, scaleParams });
      if (gateRect) {
        const isSelected = gate.id === selectedGate.id;
        ctx.strokeStyle = isSelected ? theme.plotGateSelected : theme.plotGate;
        ctx.lineWidth = Math.max(isSelected ? 2 : 1, (isSelected ? 2 : 1) * dpi);
        ctx.strokeRect(Math.min(gateRect.x0, gateRect.x1), Math.min(gateRect.y0, gateRect.y1), Math.abs(gateRect.x1 - gateRect.x0), Math.abs(gateRect.y1 - gateRect.y0));
      }
    }

    if (dragging) {
      ctx.strokeStyle = theme.plotDrag;
      ctx.lineWidth = Math.max(2, 2 * dpi);
      ctx.setLineDash([6 * dpi, 4 * dpi]);
      ctx.strokeRect(Math.min(dragging.x0, dragging.x1), Math.min(dragging.y0, dragging.y1), Math.abs(dragging.x1 - dragging.x0), Math.abs(dragging.y1 - dragging.y0));
      ctx.setLineDash([]);
    }

    const xLabel = params[plot.xParam]?.label ?? `#${plot.xParam + 1}`;
    const yLabel = params[plot.yParam]?.label ?? `#${plot.yParam + 1}`;
    overlayLeft.textContent = `N=${usedN.toLocaleString()}/${totalN.toLocaleString()}`;
    const modeLabel = plot.mode === "density" ? "density" : "scatter";
    const canUseFull = state.fullApply.status === "done" && state.fullApply.appliedRevision === state.compRevision;
    const scopeLabel = (plot.mode === "density" && canUseFull) ? "full" : (dataset.nEvents > totalN ? "preview" : "full");
    const gateLabel = selectedGate ? `, ${selectedGate.name}` : "";
    overlayRight.textContent = `${modeLabel}, ${scopeLabel}${gateLabel}`;
    if (scopeLabel === "preview") overlayRight.textContent += ` of ${dataset.nEvents.toLocaleString()}`;

    // Range パネルが開いていれば同期
    if (!rangePanel.hidden) syncRangeUI();
  }

  return { el, render };
}

// ── Range行: label + [min slider + min input] + [max slider + max input] ─
function createRangeRow(axis) {
  const row = document.createElement("div");
  row.className = "range-row";

  const lbl = document.createElement("span");
  lbl.className = "range-label";
  lbl.textContent = axis;

  const minSlider = document.createElement("input");
  minSlider.type = "range"; minSlider.className = "range-slider";
  const minInput = document.createElement("input");
  minInput.type = "number"; minInput.className = "range-num"; minInput.placeholder = "min";

  const maxSlider = document.createElement("input");
  maxSlider.type = "range"; maxSlider.className = "range-slider";
  const maxInput = document.createElement("input");
  maxInput.type = "number"; maxInput.className = "range-num"; maxInput.placeholder = "max";

  const minWrap = document.createElement("div"); minWrap.className = "range-pair";
  minWrap.append(minSlider, minInput);
  const maxWrap = document.createElement("div"); maxWrap.className = "range-pair";
  maxWrap.append(maxSlider, maxInput);

  row.append(lbl, minWrap, maxWrap);
  return { row, minInput, maxInput, minSlider, maxSlider };
}

function wrapField(labelText, inputEl) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = labelText;
  wrap.append(label, inputEl);
  return wrap;
}

function toNumberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toCanvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const dpi = window.devicePixelRatio || 1;
  return { x: (e.clientX - rect.left) * dpi, y: (e.clientY - rect.top) * dpi };
}

function clampInt(x, min, max) {
  return Math.max(min, Math.min(max, x | 0));
}

function densityColor(t, theme) {
  const tt = Math.max(0, Math.min(1, Math.sqrt(t)));
  if (tt <= 0) return [0, 0, 0, 0];
  const a = Math.max(0, Math.min(255, Math.floor(255 * Math.min(1, tt * 1.25))));
  const accent = theme.densityAccent;
  if (tt < 0.7) {
    const u = tt / 0.7;
    return [lerpInt(0, accent[0], u), lerpInt(0, accent[1], u), lerpInt(0, accent[2], u), a];
  }
  const u = (tt - 0.7) / 0.3;
  return [lerpInt(accent[0], theme.densityPeak[0], u), lerpInt(accent[1], theme.densityPeak[1], u), lerpInt(accent[2], theme.densityPeak[2], u), a];
}

function lerpInt(a, b, t) {
  return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function computeAxisRanges({ plot, raw, n, comp }) {
  let xMin = plot.xMin, xMax = plot.xMax, yMin = plot.yMin, yMax = plot.yMax;
  if (xMin == null || xMax == null || yMin == null || yMax == null) {
    let xm = Infinity, xM = -Infinity, ym = Infinity, yM = -Infinity;
    for (let k = 0; k < n; k++) {
      const xv = comp ? comp.applyPreviewValue(plot.xParam, k, raw) : raw[plot.xParam][k];
      const yv = comp ? comp.applyPreviewValue(plot.yParam, k, raw) : raw[plot.yParam][k];
      if (Number.isFinite(xv)) { if (xv < xm) xm = xv; if (xv > xM) xM = xv; }
      if (Number.isFinite(yv)) { if (yv < ym) ym = yv; if (yv > yM) yM = yv; }
    }
    if (xMin == null) xMin = xm; if (xMax == null) xMax = xM;
    if (yMin == null) yMin = ym; if (yMax == null) yMax = yM;
  }
  if (!Number.isFinite(xMin)) xMin = 0; if (!Number.isFinite(xMax)) xMax = 1;
  if (!Number.isFinite(yMin)) yMin = 0; if (!Number.isFinite(yMax)) yMax = 1;
  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) yMax = yMin + 1;
  return { xMin, xMax, yMin, yMax };
}
