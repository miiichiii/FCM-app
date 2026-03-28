import { updateAllPlots } from "../state.js";
import { transformValue } from "./transforms.js";
import { gateFromPixelRect, gateToPixelRect, addGate, getGateById, getGateAncestors } from "./gate.js";
import { getThemeColors } from "./theme.js";
import { getCompSliderConfig } from "./compUi.js";

/**
 * createPlotCard — scatter / density plot カードを作成する。
 * @param {object} state  アプリ状態
 * @param {object} plot   プロット設定オブジェクト
 * @param {Function} onActivate アクティブ化コールバック
 * @param {{ onApplyComp?: Function }} options
 *   onApplyComp(fromIndex, toIndex, value) — コンペンセーション係数を適用するコールバック
 */
export function createPlotCard(state, plot, onActivate, { onApplyComp } = {}) {
  const el = document.createElement("div");
  el.className = "plot-card";

  let isCompMode = false; // Quick Adjust (⚡ Comp) モードフラグ

  // ── Header: Scale | Mode | ⚡ Comp | ✕ ──────────────────────────
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

  const quickAdjustBtn = document.createElement("button");
  quickAdjustBtn.className = "btn btn-secondary";
  quickAdjustBtn.textContent = "⚡ Comp";
  quickAdjustBtn.title = "コンペンセーション調整モード: X/Y 軸スライダーがスピルオーバー係数の調整に切り替わります";

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-secondary";
  removeBtn.textContent = "✕";
  removeBtn.title = "プロットを削除";

  header.append(wrapField("Scale", scaleSel), wrapField("Mode", modeSel), quickAdjustBtn, removeBtn);

  // ── Y-axis: flex ROW = [ slider-col | select-col ] ─────────────
  const yAxisEl = document.createElement("div");
  yAxisEl.className = "plot-axis-y";

  // 左: スライダー列 (range / comp モードで内容が切り替わる)
  const ySliderCol = document.createElement("div");
  ySliderCol.className = "y-slider-col";

  // --- Range モード: Ymax / Ymin スライダー ---
  const yMaxSlider = document.createElement("input");
  yMaxSlider.type = "range"; yMaxSlider.className = "y-axis-slider";
  const yMinSlider = document.createElement("input");
  yMinSlider.type = "range"; yMinSlider.className = "y-axis-slider";

  const yRangeEl = document.createElement("div");
  yRangeEl.className = "y-slider-section";
  yRangeEl.append(yMaxSlider, yMinSlider);

  // --- Comp モード: Y→X スピルオーバー係数スライダー ---
  const yCompTop = document.createElement("div");
  yCompTop.className = "y-comp-edge"; // range max ラベル (例: "+1.00")
  const yCompSlider = document.createElement("input");
  yCompSlider.type = "range"; yCompSlider.className = "y-axis-slider";
  yCompSlider.min = "-1"; yCompSlider.max = "1"; yCompSlider.step = "0.005"; yCompSlider.value = "0";
  const yCompBot = document.createElement("div");
  yCompBot.className = "y-comp-edge mono"; // 現在の係数値を表示

  const yCompEl = document.createElement("div");
  yCompEl.className = "y-slider-section";
  yCompEl.hidden = true;
  yCompEl.append(yCompTop, yCompSlider, yCompBot);

  ySliderCol.append(yRangeEl, yCompEl);

  // 右: Y チャンネル select (常時表示・縦回転)
  const ySelWrap = document.createElement("div");
  ySelWrap.className = "axis-select-y-wrap";
  const ySel = document.createElement("select");
  ySel.className = "axis-select axis-select-y";
  ySelWrap.append(ySel);

  yAxisEl.append(ySliderCol, ySelWrap);

  // ── Canvas ─────────────────────────────────────────────────────
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

  // ── Plot body ──────────────────────────────────────────────────
  const plotBody = document.createElement("div");
  plotBody.className = "plot-body";
  plotBody.append(yAxisEl, canvasWrap);

  // ── X-axis: flex COL = [ X-select 行 | range/comp 制御行 ] ────
  const xAxisEl = document.createElement("div");
  xAxisEl.className = "plot-axis-x";

  // 行 1: X チャンネル select (常時表示)
  const xSelRow = document.createElement("div");
  xSelRow.className = "x-sel-row";
  const xSel = document.createElement("select");
  xSel.className = "axis-select axis-select-x";
  xSelRow.append(xSel);

  // 行 2a: Range モード — Xmin / Xmax スライダー
  const xMinSlider = document.createElement("input");
  xMinSlider.type = "range"; xMinSlider.className = "x-range-slider";
  const xMaxSlider = document.createElement("input");
  xMaxSlider.type = "range"; xMaxSlider.className = "x-range-slider";
  const autoBtn = document.createElement("button");
  autoBtn.className = "btn btn-secondary axis-auto-btn";
  autoBtn.textContent = "Auto"; autoBtn.title = "レンジを自動リセット";

  const xRangeRow = document.createElement("div");
  xRangeRow.className = "x-ctrl-row";
  xRangeRow.append(xMinSlider, xMaxSlider, autoBtn);

  // 行 2b: Comp モード — X→Y スピルオーバー係数スライダー
  const xCompLabel = document.createElement("div");
  xCompLabel.className = "x-comp-label";
  const xCompSlider = document.createElement("input");
  xCompSlider.type = "range"; xCompSlider.className = "x-comp-slider";
  xCompSlider.min = "-1"; xCompSlider.max = "1"; xCompSlider.step = "0.005"; xCompSlider.value = "0";
  const xCompValue = document.createElement("div");
  xCompValue.className = "mono x-comp-val";
  xCompValue.textContent = "0.000";
  const xResetBtn = document.createElement("button");
  xResetBtn.className = "btn btn-secondary axis-auto-btn";
  xResetBtn.textContent = "Reset";

  const xCompRow = document.createElement("div");
  xCompRow.className = "x-ctrl-row";
  xCompRow.hidden = true;
  xCompRow.append(xCompLabel, xCompSlider, xCompValue, xResetBtn);

  xAxisEl.append(xSelRow, xRangeRow, xCompRow);

  el.append(header, plotBody, xAxisEl);

  // ── アクティブ化 / 削除 ────────────────────────────────────────
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

  // ── Quick Adjust (⚡ Comp) トグル ─────────────────────────────
  quickAdjustBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setCompMode(!isCompMode);
  });

  function setCompMode(enabled) {
    isCompMode = enabled;
    quickAdjustBtn.classList.toggle("active", enabled);
    yRangeEl.hidden = enabled;
    yCompEl.hidden = !enabled;
    xRangeRow.hidden = enabled;
    xCompRow.hidden = !enabled;
    if (enabled) refreshCompSlidersUI();
    else syncRangeUI();
  }

  function refreshCompSlidersUI() {
    if (!state.comp || !state.dataset) return;
    const xP = plot.xParam, yP = plot.yParam;
    const params = state.dataset.params;
    const xLabel = params[xP]?.label ?? `Ch${xP + 1}`;
    const yLabel = params[yP]?.label ?? `Ch${yP + 1}`;

    // Y→X: Y チャンネルが X へスピルオーバー
    const yToX = state.comp.getCoeff(yP, xP);
    const cfgYX = getCompSliderConfig(yToX);
    yCompSlider.min = String(cfgYX.min); yCompSlider.max = String(cfgYX.max);
    yCompSlider.step = String(cfgYX.step);
    yCompSlider.value = String(Math.max(cfgYX.min, Math.min(cfgYX.max, yToX)));
    yCompTop.textContent = cfgYX.max.toFixed(2);
    yCompBot.textContent = yToX.toFixed(3);

    // X→Y: X チャンネルが Y へスピルオーバー
    const xToY = state.comp.getCoeff(xP, yP);
    const cfgXY = getCompSliderConfig(xToY);
    xCompSlider.min = String(cfgXY.min); xCompSlider.max = String(cfgXY.max);
    xCompSlider.step = String(cfgXY.step);
    xCompSlider.value = String(Math.max(cfgXY.min, Math.min(cfgXY.max, xToY)));
    xCompValue.textContent = xToY.toFixed(3);
    xCompLabel.textContent = `${xLabel}→${yLabel}:`;
  }

  // ── 軸 select ────────────────────────────────────────────────────
  xSel.addEventListener("change", () => {
    plot.xParam = Number(xSel.value);
    if (isCompMode) refreshCompSlidersUI();
    updateAllPlots(state);
  });
  ySel.addEventListener("change", () => {
    plot.yParam = Number(ySel.value);
    if (isCompMode) refreshCompSlidersUI();
    updateAllPlots(state);
  });
  scaleSel.addEventListener("change", () => { plot.scale = scaleSel.value; updateAllPlots(state); });
  modeSel.addEventListener("change", () => { plot.mode = modeSel.value; updateAllPlots(state); });

  // ── Y レンジスライダー ─────────────────────────────────────────
  yMaxSlider.addEventListener("input", () => {
    plot.yMax = Number(yMaxSlider.value);
    updateAllPlots(state);
  });
  yMinSlider.addEventListener("input", () => {
    plot.yMin = Number(yMinSlider.value);
    updateAllPlots(state);
  });

  // ── X レンジスライダー ─────────────────────────────────────────
  xMinSlider.addEventListener("input", () => {
    plot.xMin = Number(xMinSlider.value);
    updateAllPlots(state);
  });
  xMaxSlider.addEventListener("input", () => {
    plot.xMax = Number(xMaxSlider.value);
    updateAllPlots(state);
  });
  autoBtn.addEventListener("click", () => {
    plot.xMin = null; plot.xMax = null; plot.yMin = null; plot.yMax = null;
    syncRangeUI(); updateAllPlots(state);
  });

  // ── Comp スライダー ────────────────────────────────────────────
  yCompSlider.addEventListener("input", () => {
    if (!isCompMode) return;
    const v = Number(yCompSlider.value);
    yCompBot.textContent = v.toFixed(3);
    onApplyComp?.(plot.yParam, plot.xParam, v);
  });
  xCompSlider.addEventListener("input", () => {
    if (!isCompMode) return;
    const v = Number(xCompSlider.value);
    xCompValue.textContent = v.toFixed(3);
    onApplyComp?.(plot.xParam, plot.yParam, v);
  });
  xResetBtn.addEventListener("click", () => {
    if (!isCompMode || !state.comp) return;
    onApplyComp?.(plot.xParam, plot.yParam, 0);
    onApplyComp?.(plot.yParam, plot.xParam, 0);
    refreshCompSlidersUI();
  });

  // ── Range UI 同期 ─────────────────────────────────────────────
  function syncRangeUI() {
    const raw = state.dataset?.preview?.channels;
    const n   = state.dataset?.preview?.n ?? 0;
    const comp = state.comp;
    const auto = raw ? computeAxisRanges({ plot, raw, n, comp })
                     : { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const xMin = plot.xMin ?? auto.xMin;
    const xMax = plot.xMax ?? auto.xMax;
    const yMin = plot.yMin ?? auto.yMin;
    const yMax = plot.yMax ?? auto.yMax;

    const xSpan = Math.abs(auto.xMax - auto.xMin) || 1;
    const ySpan = Math.abs(auto.yMax - auto.yMin) || 1;

    // スライダーレンジをデータ幅の2倍に設定
    setSliderRange(xMinSlider, auto.xMin - xSpan, auto.xMax, xMin);
    setSliderRange(xMaxSlider, auto.xMin, auto.xMax + xSpan, xMax);
    setSliderRange(yMaxSlider, auto.yMin, auto.yMax + ySpan, yMax);
    setSliderRange(yMinSlider, auto.yMin - ySpan, auto.yMax, yMin);
  }

  function setSliderRange(slider, min, max, val) {
    slider.min  = String(min);
    slider.max  = String(max);
    slider.step = String(Math.max(0.001, (max - min) / 200));
    slider.value = String(Math.max(min, Math.min(max, val)));
  }

  function setSliderVal(slider, val) {
    slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), val)));
  }

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
      const gateDef = gateFromPixelRect({
        plot, pixelRect: dragging,
        plotArea: lastGeom.plotArea,
        axisRanges: lastGeom.axisRanges,
        scaleParams: lastGeom.scaleParams,
      });
      addGate(state, gateDef);
    }
    dragging = null;
    render();
  });

  const ro = new ResizeObserver(() => render());
  ro.observe(canvasWrap);

  const densityCanvas = document.createElement("canvas");
  densityCanvas.width = 128; densityCanvas.height = 128;
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
    const opts = params.map((p, i) => `<option value="${i}">${p.label}</option>`).join("");
    xSel.innerHTML = opts;
    ySel.innerHTML = opts;
    xSel.value  = String(plot.xParam);
    ySel.value  = String(plot.yParam);
    scaleSel.value = plot.scale;
    modeSel.value  = plot.mode;

    if (isCompMode) refreshCompSlidersUI();
    else syncRangeUI();

    const dpi  = window.devicePixelRatio || 1;
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
      left:   10 * dpi,
      top:    10 * dpi,
      width:  w - 20 * dpi,
      height: h - 20 * dpi,
    };

    const scaleParams = {
      arcsinhCofactor:  plot.arcsinhCofactor,
      logicleLinthresh: plot.logicleLinthresh,
    };

    const raw  = dataset.preview.channels;
    const n    = dataset.preview.n;
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

    ctx.strokeStyle = theme.plotFrame;
    ctx.lineWidth = Math.max(1, dpi);
    ctx.strokeRect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);

    // ── 軸目盛り ──────────────────────────────────────────────────
    drawAxisTicks(ctx, plotArea, axisRanges, plot.scale, scaleParams, dpi, theme);

    const selectedGate = getGateById(state, state.selectedGateId);
    const gateChain = selectedGate
      ? [selectedGate, ...getGateAncestors(state, selectedGate.id)]
      : [];
    const gateDefs = gateChain.map((g) => g.definition).filter(Boolean);

    let usedN = 0;
    let totalN = n;

    if (plot.mode === "density") {
      const canUseFull = state.fullApply.status === "done" &&
        state.fullApply.appliedRevision === state.compRevision;

      if (canUseFull) {
        const key = `${plot.xParam}-${plot.yParam}-${plot.scale}-${axisRanges.xMin}-${axisRanges.xMax}-${axisRanges.yMin}-${axisRanges.yMax}-${gateChain.map((g) => g.id).join(",")}`;
        const cached  = state.density.cacheByPlotId.get(plot.id);
        const pending = state.density.pendingByPlotId.get(plot.id);

        if (cached && cached.key === key) {
          totalN = cached.total; usedN = cached.nPassed;
          if (densityCtx) {
            const img = densityCtx.createImageData(cached.width, cached.height);
            const out = img.data;
            const denom = Math.log(1 + cached.maxCount);
            for (let i = 0; i < cached.counts.length; i++) {
              const t = denom > 0 ? Math.log(1 + cached.counts[i]) / denom : 0;
              const [r, g, b, a] = densityColor(t, theme);
              const o = i * 4;
              out[o] = r; out[o+1] = g; out[o+2] = b; out[o+3] = a;
            }
            densityCtx.putImageData(img, 0, 0);
            ctx.save(); ctx.imageSmoothingEnabled = false;
            ctx.drawImage(densityCanvas, plotArea.left, plotArea.top, plotArea.width, plotArea.height);
            ctx.restore();
          }
        } else {
          if (!pending || pending.key !== key) {
            const requestId = state.density.nextRequestId++;
            state.density.pendingByPlotId.set(plot.id, { requestId, key });
            state.fullWorker.postMessage({
              type: "density", requestId, plotId: plot.id, key,
              xParam: plot.xParam, yParam: plot.yParam, scale: plot.scale,
              axisRanges, scaleParams, gates: gateDefs,
              binsW: densityCanvas.width, binsH: densityCanvas.height,
            });
          }
          ctx.fillStyle = theme.plotLoading;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = `${14 * dpi}px sans-serif`;
          ctx.fillText("Loading full density…", plotArea.left + plotArea.width / 2, plotArea.top + plotArea.height / 2);
          totalN = state.dataset.nEvents; usedN = 0;
        }
      } else {
        const binsW = densityCanvas.width, binsH = densityCanvas.height;
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
            out[o] = r; out[o+1] = g; out[o+2] = b; out[o+3] = a;
          }
          densityCtx.putImageData(img, 0, 0);
          ctx.save(); ctx.imageSmoothingEnabled = false;
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
        if (py < plotArea.top  || py > plotArea.top  + plotArea.height) continue;
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
        ctx.strokeRect(
          Math.min(gateRect.x0, gateRect.x1), Math.min(gateRect.y0, gateRect.y1),
          Math.abs(gateRect.x1 - gateRect.x0), Math.abs(gateRect.y1 - gateRect.y0),
        );
      }
    }

    if (dragging) {
      ctx.strokeStyle = theme.plotDrag;
      ctx.lineWidth = Math.max(2, 2 * dpi);
      ctx.setLineDash([6 * dpi, 4 * dpi]);
      ctx.strokeRect(
        Math.min(dragging.x0, dragging.x1), Math.min(dragging.y0, dragging.y1),
        Math.abs(dragging.x1 - dragging.x0), Math.abs(dragging.y1 - dragging.y0),
      );
      ctx.setLineDash([]);
    }

    overlayLeft.textContent = `N=${usedN.toLocaleString()}/${totalN.toLocaleString()}`;
    const modeLabel = plot.mode === "density" ? "density" : "scatter";
    const canUseFull = state.fullApply.status === "done" &&
      state.fullApply.appliedRevision === state.compRevision;
    const scopeLabel = (plot.mode === "density" && canUseFull)
      ? "full"
      : (dataset.nEvents > totalN ? "preview" : "full");
    const selectedGate2 = getGateById(state, state.selectedGateId);
    const gateLabel = selectedGate2 ? `, ${selectedGate2.name}` : "";
    overlayRight.textContent = `${modeLabel}, ${scopeLabel}${gateLabel}`;
    if (scopeLabel === "preview") overlayRight.textContent += ` of ${dataset.nEvents.toLocaleString()}`;
  }

  return { el, render };
}

// ── ヘルパー: フィールドラベル付き wrap ──────────────────────────
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
  return [
    lerpInt(accent[0], theme.densityPeak[0], u),
    lerpInt(accent[1], theme.densityPeak[1], u),
    lerpInt(accent[2], theme.densityPeak[2], u),
    a,
  ];
}

function lerpInt(a, b, t) {
  return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ── 軸目盛り描画 ──────────────────────────────────────────────────
function drawAxisTicks(ctx, plotArea, axisRanges, scale, scaleParams, dpi, theme) {
  const { xMin, xMax, yMin, yMax } = axisRanges;
  const xMinT = transformValue(scale, xMin, scaleParams);
  const xMaxT = transformValue(scale, xMax, scaleParams);
  const yMinT = transformValue(scale, yMin, scaleParams);
  const yMaxT = transformValue(scale, yMax, scaleParams);
  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;

  ctx.save();
  ctx.fillStyle = theme.plotText ?? "rgba(66,53,39,0.6)";
  ctx.globalAlpha = 0.7;
  const fs = Math.max(6, Math.round(8.5 * dpi));
  ctx.font = `${fs}px ui-monospace,monospace`;

  // X-axis ticks (inside bottom edge)
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const xTicks = computeTicks(xMin, xMax, scale, 4);
  for (const v of xTicks) {
    const t = transformValue(scale, v, scaleParams);
    const nx = (t - xMinT) / denomX;
    if (nx < 0.02 || nx > 0.98) continue;
    const px = plotArea.left + nx * plotArea.width;
    const py = plotArea.top + plotArea.height;
    ctx.fillRect(px - 0.5, py - 4 * dpi, 1, 4 * dpi);
    ctx.fillText(fmtTick(v), px, py - 5 * dpi);
  }

  // Y-axis ticks (inside left edge)
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const yTicks = computeTicks(yMin, yMax, scale, 4);
  for (const v of yTicks) {
    const t = transformValue(scale, v, scaleParams);
    const ny = (t - yMinT) / denomY;
    if (ny < 0.03 || ny > 0.97) continue;
    const py = plotArea.top + (1 - ny) * plotArea.height;
    ctx.fillRect(plotArea.left, py - 0.5, 4 * dpi, 1);
    ctx.fillText(fmtTick(v), plotArea.left + 5 * dpi, py);
  }
  ctx.restore();
}

function computeTicks(min, max, scale, n) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [];
  if (scale === "linear") return linearTicks(min, max, n);

  // logicle / arcsinh: use 0 + powers of 10
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
  const posEnd = Math.ceil(Math.log10(Math.max(1, max)));
  for (let e = posStart; e <= posEnd && ticks.length < n + 3; e++) {
    const v = Math.pow(10, e);
    if (v >= min * 0.99 && v <= max * 1.01) ticks.push(v);
  }
  if (ticks.length < 2) return linearTicks(min, max, n);
  return ticks;
}

function linearTicks(min, max, n) {
  const range = max - min;
  if (!range) return [];
  const rough = range / n;
  const exp = Math.floor(Math.log10(rough || 1));
  const base = Math.pow(10, exp);
  const m = rough / base;
  let step = m < 1.5 ? base : m < 3.5 ? 2 * base : m < 7.5 ? 5 * base : 10 * base;
  const ticks = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max * 1.001 && ticks.length < n + 2; v += step) {
    ticks.push(parseFloat(v.toPrecision(8)));
  }
  return ticks;
}

function fmtTick(v) {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e5) return (v / 1000).toFixed(0) + "k";
  if (abs >= 1e4) return (v / 1000).toFixed(1) + "k";
  if (abs >= 100) return String(Math.round(v));
  if (abs >= 1) return String(Math.round(v * 10) / 10);
  if (abs >= 0.1) return v.toPrecision(1);
  return v.toExponential(0);
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
