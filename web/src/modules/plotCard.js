import { updateAllPlots } from "../state.js";
import { transformValue, inverseTransformValue } from "./transforms.js";
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

  const SCALE_OPTS = `<option value="linear">Linear</option><option value="logicle">Logicle</option><option value="arcsinh">Arcsinh</option>`;
  const xScaleSel = document.createElement("select");
  xScaleSel.innerHTML = SCALE_OPTS;
  const yScaleSel = document.createElement("select");
  yScaleSel.innerHTML = SCALE_OPTS;
  const modeSel = document.createElement("select");
  modeSel.innerHTML = `
    <option value="scatter">Scatter</option>
    <option value="density">Density</option>
  `;

  const quickAdjustBtn = document.createElement("button");
  quickAdjustBtn.className = "btn btn-secondary";
  quickAdjustBtn.textContent = "⚡ Comp";
  quickAdjustBtn.title = "コンペンセーション調整モード: X/Y 軸スライダーがスピルオーバー係数の調整に切り替わります";

  const savePngBtn = document.createElement("button");
  savePngBtn.className = "btn btn-secondary save-png-btn";
  savePngBtn.textContent = "💾";
  savePngBtn.title = "PNG として保存";

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-secondary";
  removeBtn.textContent = "✕";
  removeBtn.title = "プロットを削除";

  header.append(wrapField("X-Scale", xScaleSel), wrapField("Y-Scale", yScaleSel), wrapField("Mode", modeSel), quickAdjustBtn, savePngBtn, removeBtn);

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

  // PNG 保存ボタン（300 DPI 相当の高解像度出力）
  savePngBtn.addEventListener("click", () => {
    const xName = state.dataset?.params?.[plot.xParam]?.name ?? `P${plot.xParam+1}`;
    const yName = state.dataset?.params?.[plot.yParam]?.name ?? `P${plot.yParam+1}`;
    // Export the native canvas pixel buffer (already scaled by devicePixelRatio,
    // giving 2x–3x resolution on HiDPI displays — sufficient for print quality).
    const link = document.createElement("a");
    link.download = `plot_${yName}_vs_${xName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  // ── Plot body ──────────────────────────────────────────────────
  const plotBody = document.createElement("div");
  plotBody.className = "plot-body";
  plotBody.append(yAxisEl, canvasWrap);

  // ── X-axis: flex COL = [ X-select 行 | range/comp 制御行 ] ────
  const xAxisEl = document.createElement("div");
  xAxisEl.className = "plot-axis-x";

  // 行 1: X チャンネル select + Auto ボタン (常時表示)
  const xSelRow = document.createElement("div");
  xSelRow.className = "x-sel-row";
  const xSel = document.createElement("select");
  xSel.className = "axis-select axis-select-x";
  const xAutoBtn = document.createElement("button");
  xAutoBtn.className = "btn btn-secondary axis-auto-btn";
  xAutoBtn.textContent = "X-Auto"; xAutoBtn.title = "X軸レンジを自動リセット";
  const yAutoBtn = document.createElement("button");
  yAutoBtn.className = "btn btn-secondary axis-auto-btn";
  yAutoBtn.textContent = "Y-Auto"; yAutoBtn.title = "Y軸レンジを自動リセット";

  // Max 数値入力ボックス (X/Y)
  const xMaxInput = document.createElement("input");
  xMaxInput.type = "number"; xMaxInput.className = "axis-max-input";
  xMaxInput.title = "X軸最大値を直接入力";
  const yMaxInput = document.createElement("input");
  yMaxInput.type = "number"; yMaxInput.className = "axis-max-input";
  yMaxInput.title = "Y軸最大値を直接入力";

  const xMaxLabel = document.createElement("span"); xMaxLabel.className = "axis-max-label"; xMaxLabel.textContent = "X:";
  const yMaxLabel = document.createElement("span"); yMaxLabel.className = "axis-max-label"; yMaxLabel.textContent = "Y:";

  xSelRow.append(xSel, xAutoBtn, yAutoBtn, xMaxLabel, xMaxInput, yMaxLabel, yMaxInput);

  // Range スライダー (非表示: canvas マーカードラッグで代替)
  const xMinSlider = document.createElement("input");
  xMinSlider.type = "range"; xMinSlider.className = "x-range-slider";
  const xMaxSlider = document.createElement("input");
  xMaxSlider.type = "range"; xMaxSlider.className = "x-range-slider";

  const xRangeRow = document.createElement("div");
  xRangeRow.className = "x-ctrl-row";
  xRangeRow.hidden = true; // 常時非表示 (スライダーUI廃止)
  xRangeRow.append(xMinSlider, xMaxSlider);

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
    // Range slider rows always hidden (canvas drag markers replace them)
    yRangeEl.hidden = true;
    yCompEl.hidden = !enabled;
    xRangeRow.hidden = true;
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

    // X→Y: X チャンネルが Y へスピルオーバー (Y スライダーが制御)
    const xToY = state.comp.getCoeff(xP, yP);
    const cfgXY = getCompSliderConfig(xToY);
    yCompSlider.min = String(cfgXY.min); yCompSlider.max = String(cfgXY.max);
    yCompSlider.step = String(cfgXY.step);
    yCompSlider.value = String(Math.max(cfgXY.min, Math.min(cfgXY.max, xToY)));
    yCompTop.textContent = `${xLabel}→${yLabel}`;
    yCompBot.textContent = xToY.toFixed(3);

    // Y→X: Y チャンネルが X へスピルオーバー (X スライダーが制御)
    const yToX = state.comp.getCoeff(yP, xP);
    const cfgYX = getCompSliderConfig(yToX);
    xCompSlider.min = String(cfgYX.min); xCompSlider.max = String(cfgYX.max);
    xCompSlider.step = String(cfgYX.step);
    xCompSlider.value = String(Math.max(cfgYX.min, Math.min(cfgYX.max, yToX)));
    xCompValue.textContent = yToX.toFixed(3);
    xCompLabel.textContent = `${yLabel}→${xLabel}:`;
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
  xScaleSel.addEventListener("change", () => { plot.xScale = xScaleSel.value; updateAllPlots(state); });
  yScaleSel.addEventListener("change", () => { plot.yScale = yScaleSel.value; updateAllPlots(state); });
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
  xAutoBtn.addEventListener("click", () => {
    plot.xMin = null; plot.xMax = null;
    syncRangeUI(); updateAllPlots(state);
  });
  yAutoBtn.addEventListener("click", () => {
    plot.yMin = null; plot.yMax = null;
    syncRangeUI(); updateAllPlots(state);
  });

  // Max 数値入力: Enter or blur で確定
  function applyMaxInput(input, axis) {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return;
    if (axis === "x") { plot.xMax = v; }
    else              { plot.yMax = v; }
    syncRangeUI(); updateAllPlots(state);
  }
  xMaxInput.addEventListener("change", () => applyMaxInput(xMaxInput, "x"));
  xMaxInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyMaxInput(xMaxInput, "x"); });
  yMaxInput.addEventListener("change", () => applyMaxInput(yMaxInput, "y"));
  yMaxInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyMaxInput(yMaxInput, "y"); });

  // ── Comp スライダー ────────────────────────────────────────────
  yCompSlider.addEventListener("input", () => {
    if (!isCompMode) return;
    const v = Number(yCompSlider.value);
    yCompBot.textContent = v.toFixed(3);
    onApplyComp?.(plot.xParam, plot.yParam, v);
  });
  xCompSlider.addEventListener("input", () => {
    if (!isCompMode) return;
    const v = Number(xCompSlider.value);
    xCompValue.textContent = v.toFixed(3);
    onApplyComp?.(plot.yParam, plot.xParam, v);
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

    const xMax = plot.xMax ?? auto.xMax;
    const yMax = plot.yMax ?? auto.yMax;

    // Max 入力ボックスの表示値を更新 (ユーザーが編集中でなければ)
    if (document.activeElement !== xMaxInput) xMaxInput.value = xMax.toExponential(2);
    if (document.activeElement !== yMaxInput) yMaxInput.value = yMax.toExponential(2);

    const xSpan = Math.abs(auto.xMax - auto.xMin) || 1;
    const ySpan = Math.abs(auto.yMax - auto.yMin) || 1;
    // Hidden range sliders: keep in sync for any legacy code that reads them
    setSliderRange(xMinSlider, auto.xMin - xSpan, auto.xMax, plot.xMin ?? auto.xMin);
    setSliderRange(xMaxSlider, auto.xMin, auto.xMax + xSpan, xMax);
    setSliderRange(yMaxSlider, auto.yMin, auto.yMax + ySpan, yMax);
    setSliderRange(yMinSlider, auto.yMin - ySpan, auto.yMax, plot.yMin ?? auto.yMin);
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

  // ── Range marker drag (triangle handles on axis margins) ────────
  let rangeDrag = null; // { axis: "x"|"y", which: "min"|"max" }
  let dragging = null;
  let lastGeom = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!lastGeom) return;
    const pt = toCanvasPoint(canvas, e);
    // Check range marker hit first
    const { plotArea: pa, axisRanges: ar, scaleParams: sp } = lastGeom;
    const dpiNow = window.devicePixelRatio || 1;
    const hit = hitRangeMarker(pt, pa, ar, plot.xScale, plot.yScale, sp, dpiNow);
    if (hit) {
      canvas.setPointerCapture(e.pointerId);
      rangeDrag = hit;
      return;
    }
    if (!state.gatingArmed) return;
    if (state.activePlotId !== plot.id) return;
    canvas.setPointerCapture(e.pointerId);
    dragging = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    render();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (rangeDrag) {
      const pt = toCanvasPoint(canvas, e);
      const { plotArea, axisRanges, scaleParams } = lastGeom;
      // 0-anchor drag: user drags the "0" marker to set how much negative range is shown.
      // Formula: when data 0 is at screen fraction r (0=left/bottom, 1=right/top),
      //   MinT = -r * MaxT / (1 - r)   [since transform(0)=0 for all scales]
      if (rangeDrag.axis === "x") {
        const TMax = transformValue(plot.xScale, plot.xMax ?? axisRanges.xMax, scaleParams);
        const r = Math.max(0, Math.min(0.97, (pt.x - plotArea.left) / plotArea.width));
        const xMinT_new = r < 0.001 ? 0 : -r * TMax / (1 - r);
        const xMin_new  = inverseTransformValue(plot.xScale, xMinT_new, scaleParams);
        plot.xMin = Math.min(0, xMin_new);
        syncRangeUI(); updateAllPlots(state);
      } else {
        const TMax = transformValue(plot.yScale, plot.yMax ?? axisRanges.yMax, scaleParams);
        // ny: fraction from bottom (0=bottom, 1=top); pointer is at (pt.y - top)/height from top → ny = 1 - that
        const ny = Math.max(0, Math.min(0.97, 1 - (pt.y - plotArea.top) / plotArea.height));
        const yMinT_new = ny < 0.001 ? 0 : -ny * TMax / (1 - ny);
        const yMin_new  = inverseTransformValue(plot.yScale, yMinT_new, scaleParams);
        plot.yMin = Math.min(0, yMin_new);
        syncRangeUI(); updateAllPlots(state);
      }
      return;
    }
    if (!dragging) return;
    const pt = toCanvasPoint(canvas, e);
    dragging.x1 = pt.x; dragging.y1 = pt.y;
    render();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (rangeDrag) { rangeDrag = null; return; }
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
  densityCanvas.width = 256; densityCanvas.height = 256;
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
    xScaleSel.value = plot.xScale;
    yScaleSel.value = plot.yScale;
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

    // プロット内余白 (CSS px 単位 — canvas 内のデータ描画領域を定義)
    const LEFT_MARGIN   = 45;
    const TOP_MARGIN    =  8;
    const RIGHT_MARGIN  = 40; // extra space for density colorbar
    const BOTTOM_MARGIN = 30;

    const plotArea = {
      left:   LEFT_MARGIN   * dpi,
      top:    TOP_MARGIN    * dpi,
      width:  w - (LEFT_MARGIN + RIGHT_MARGIN)   * dpi,
      height: h - (TOP_MARGIN  + BOTTOM_MARGIN)  * dpi,
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

    const xMinT = transformValue(plot.xScale, axisRanges.xMin, scaleParams);
    const xMaxT = transformValue(plot.xScale, axisRanges.xMax, scaleParams);
    const yMinT = transformValue(plot.yScale, axisRanges.yMin, scaleParams);
    const yMaxT = transformValue(plot.yScale, axisRanges.yMax, scaleParams);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.plotCanvasBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = theme.plotFrame;
    ctx.lineWidth = Math.max(1, dpi);
    ctx.strokeRect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);

    // ── 軸目盛り ──────────────────────────────────────────────────
    const xLabel = state.dataset?.params?.[plot.xParam]?.name ?? `P${plot.xParam+1}`;
    const yLabel = state.dataset?.params?.[plot.yParam]?.name ?? `P${plot.yParam+1}`;
    drawAxisTicks(ctx, plotArea, axisRanges, plot.xScale, plot.yScale, scaleParams, dpi, theme, xLabel, yLabel, LEFT_MARGIN);

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
        const key = `${plot.xParam}-${plot.yParam}-${plot.xScale}-${plot.yScale}-${axisRanges.xMin}-${axisRanges.xMax}-${axisRanges.yMin}-${axisRanges.yMax}-${gateChain.map((g) => g.id).join(",")}`;
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
              xParam: plot.xParam, yParam: plot.yParam, xScale: plot.xScale, yScale: plot.yScale, scale: plot.xScale,
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
          const xt = transformValue(plot.xScale, xv, scaleParams);
          const yt = transformValue(plot.yScale, yv, scaleParams);
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
        const xt = transformValue(plot.xScale, xv, scaleParams);
        const yt = transformValue(plot.yScale, yv, scaleParams);
        const px = plotArea.left + ((xt - xMinT) / (xMaxT - xMinT)) * plotArea.width;
        const py = plotArea.top + (1 - (yt - yMinT) / (yMaxT - yMinT)) * plotArea.height;
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        if (px < plotArea.left || px > plotArea.left + plotArea.width) continue;
        if (py < plotArea.top  || py > plotArea.top  + plotArea.height) continue;
        ctx.fillRect(px, py, Math.max(1, dpi), Math.max(1, dpi));
        usedN++;
      }
    }

    // Density colorbar (density mode only)
    if (plot.mode === "density") {
      drawDensityColorbar(ctx, plotArea, dpi, theme);
    }

    // Range drag markers (0-anchor triangles)
    if (!isCompMode) {
      drawRangeMarkers(ctx, plotArea, axisRanges, plot.xScale, plot.yScale, scaleParams, dpi, theme);
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

// ── Range drag markers ───────────────────────────────────────────
/**
 * 0-anchor triangle markers on axis margins.
 *
 * X-axis (bottom margin): ▲ triangle at data value 0 on the X-axis.
 *   Dragging left/right changes xMin — how much negative range is shown.
 *   Formula: xMinT = -r * TMax / (1 - r)  (r = fraction where 0 should appear)
 *
 * Y-axis (left margin): ▶ triangle at data value 0 on the Y-axis.
 *   Dragging up/down changes yMin.
 *
 * xMax / yMax are controlled by the number input boxes in the UI.
 */
function drawRangeMarkers(ctx, plotArea, axisRanges, xScale, yScale, scaleParams, dpi, theme) {
  const bottom = plotArea.top + plotArea.height;
  const S = 7 * dpi;
  const G = 5 * dpi;

  ctx.save();
  ctx.fillStyle   = theme.plotGate ?? "rgba(60,120,200,0.85)";
  ctx.strokeStyle = theme.plotCanvasBg ?? "#fff";
  ctx.lineWidth   = Math.max(1, dpi * 0.8);
  ctx.globalAlpha = 0.85;

  function tri(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Pixel position of data value 0 on each axis
  const { xMin, xMax, yMin, yMax } = axisRanges;
  const xMinT = transformValue(xScale, xMin, scaleParams);
  const xMaxT = transformValue(xScale, xMax, scaleParams);
  const yMinT = transformValue(yScale, yMin, scaleParams);
  const yMaxT = transformValue(yScale, yMax, scaleParams);
  const T0 = 0; // transform(0) = 0 for all supported scales (linear, logicle, arcsinh)

  const nx0 = (T0 - xMinT) / (xMaxT - xMinT || 1);
  const ny0 = (T0 - yMinT) / (yMaxT - yMinT || 1);

  // X-axis 0-marker: ▲ below the plot, at nx0 position
  if (nx0 >= -0.05 && nx0 <= 1.05) {
    const px = plotArea.left + nx0 * plotArea.width;
    const yT = bottom + G;
    tri([[px, yT], [px - S, yT + S * 1.4], [px + S, yT + S * 1.4]]);
    // small vertical dashed line from axis to marker
    ctx.save();
    ctx.setLineDash([2 * dpi, 2 * dpi]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(px, bottom); ctx.lineTo(px, yT); ctx.stroke();
    ctx.restore();
  }

  // Y-axis 0-marker: ▶ to the left of the plot, at ny0 position
  if (ny0 >= -0.05 && ny0 <= 1.05) {
    const py = plotArea.top + (1 - ny0) * plotArea.height;
    const xL = plotArea.left - G;
    tri([[xL, py], [xL - S * 1.4, py - S], [xL - S * 1.4, py + S]]);
    ctx.save();
    ctx.setLineDash([2 * dpi, 2 * dpi]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(plotArea.left, py); ctx.lineTo(xL, py); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/** Returns { axis:"x"|"y", which:"zero" } if pt is near the 0-anchor marker */
function hitRangeMarker(pt, plotArea, axisRanges, xScale, yScale, scaleParams, dpi) {
  const bottom = plotArea.top + plotArea.height;
  const S = 7 * dpi;
  const G = 5 * dpi;
  const HIT = 14 * dpi;

  const { xMin, xMax, yMin, yMax } = axisRanges;
  const xMinT = transformValue(xScale, xMin, scaleParams);
  const xMaxT = transformValue(xScale, xMax, scaleParams);
  const yMinT = transformValue(yScale, yMin, scaleParams);
  const yMaxT = transformValue(yScale, yMax, scaleParams);
  const T0 = 0;

  const nx0 = (T0 - xMinT) / (xMaxT - xMinT || 1);
  if (nx0 >= -0.1 && nx0 <= 1.1) {
    const px = plotArea.left + nx0 * plotArea.width;
    const yT = bottom + G + S * 0.7;
    if (Math.abs(pt.x - px) < HIT && Math.abs(pt.y - yT) < HIT) return { axis: "x", which: "zero" };
  }

  const ny0 = (T0 - yMinT) / (yMaxT - yMinT || 1);
  if (ny0 >= -0.1 && ny0 <= 1.1) {
    const py = plotArea.top + (1 - ny0) * plotArea.height;
    const xL = plotArea.left - G - S * 0.7;
    if (Math.abs(pt.x - xL) < HIT && Math.abs(pt.y - py) < HIT) return { axis: "y", which: "zero" };
  }

  return null;
}

// ── Density colorbar ─────────────────────────────────────────────
function drawDensityColorbar(ctx, plotArea, dpi, theme) {
  const cbW = 10 * dpi;
  const gap  =  6 * dpi;
  const cbX  = plotArea.left + plotArea.width + gap;
  const cbY  = plotArea.top;
  const cbH  = plotArea.height;

  // Background (for alpha=0 at low end)
  ctx.save();
  ctx.fillStyle = theme.plotCanvasBg ?? "#fff";
  ctx.fillRect(cbX, cbY, cbW, cbH);

  // Gradient strip — top = high density, bottom = low density
  for (let i = 0; i <= Math.ceil(cbH); i++) {
    const t = 1 - i / cbH;
    const [r, g, b, a] = densityColor(t, theme);
    if (a > 0) {
      ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
      ctx.fillRect(cbX, cbY + i, cbW, 1);
    }
  }

  // Border
  ctx.strokeStyle = theme.plotFrame ?? "rgba(0,0,0,0.4)";
  ctx.lineWidth   = Math.max(1, dpi * 0.7);
  ctx.strokeRect(cbX, cbY, cbW, cbH);

  // "H" / "L" labels
  const fs = Math.max(7, Math.round(8 * dpi));
  ctx.font         = `${fs}px ui-monospace,monospace`;
  ctx.fillStyle    = theme.plotText ?? "rgba(66,53,39,0.75)";
  ctx.globalAlpha  = 0.8;
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";
  ctx.fillText("H", cbX + cbW + 2 * dpi, cbY);
  ctx.textBaseline = "bottom";
  ctx.fillText("L", cbX + cbW + 2 * dpi, cbY + cbH);

  ctx.restore();
}

// ── 軸目盛り描画 ──────────────────────────────────────────────────
function drawAxisTicks(ctx, plotArea, axisRanges, xScale, yScale, scaleParams, dpi, theme, xLabel, yLabel, leftMarginPx = 45) {
  const { xMin, xMax, yMin, yMax } = axisRanges;
  const xMinT = transformValue(xScale, xMin, scaleParams);
  const xMaxT = transformValue(xScale, xMax, scaleParams);
  const yMinT = transformValue(yScale, yMin, scaleParams);
  const yMaxT = transformValue(yScale, yMax, scaleParams);
  const denomX = xMaxT - xMinT || 1;
  const denomY = yMaxT - yMinT || 1;
  const right  = plotArea.left + plotArea.width;
  const bottom = plotArea.top  + plotArea.height;

  ctx.save();
  ctx.fillStyle  = theme.plotText ?? "rgba(66,53,39,0.75)";
  ctx.strokeStyle = theme.plotText ?? "rgba(66,53,39,0.75)";
  ctx.globalAlpha = 0.85;
  const fs = Math.max(7, Math.round(9 * dpi));
  ctx.font = `${fs}px ui-monospace,monospace`;

  // X-axis ticks: label & tick mark BELOW the plot box
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = computeTicks(xMin, xMax, xScale, 4);
  for (const v of xTicks) {
    const t  = transformValue(xScale, v, scaleParams);
    const nx = (t - xMinT) / denomX;
    if (nx < 0.02 || nx > 0.98) continue;
    const px = plotArea.left + nx * plotArea.width;
    // tick mark extending downward from bottom edge
    ctx.beginPath();
    ctx.moveTo(px, bottom);
    ctx.lineTo(px, bottom + 4 * dpi);
    ctx.lineWidth = Math.max(1, dpi * 0.8);
    ctx.stroke();
    ctx.fillText(fmtTick(v), px, bottom + 5 * dpi);
  }

  // Y-axis ticks: label & tick mark LEFT of the plot box
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yTicks = computeTicks(yMin, yMax, yScale, 4);
  for (const v of yTicks) {
    const t  = transformValue(yScale, v, scaleParams);
    const ny = (t - yMinT) / denomY;
    if (ny < 0.03 || ny > 0.97) continue;
    const py = plotArea.top + (1 - ny) * plotArea.height;
    // tick mark extending leftward from left edge
    ctx.beginPath();
    ctx.moveTo(plotArea.left, py);
    ctx.lineTo(plotArea.left - 4 * dpi, py);
    ctx.lineWidth = Math.max(1, dpi * 0.8);
    ctx.stroke();
    ctx.fillText(fmtTick(v), plotArea.left - 6 * dpi, py);
  }

  // X-axis title (centered below tick labels, inside canvas bottom margin)
  if (xLabel) {
    ctx.save();
    ctx.font = `bold ${Math.max(8, Math.round(10 * dpi))}px sans-serif`;
    ctx.globalAlpha = 0.9;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // bottom is plotArea.top + plotArea.height = h - 28*dpi
    // Place title 18px below bottom edge (tick labels are 5px below + ~9px tall)
    ctx.fillText(xLabel, plotArea.left + plotArea.width / 2, bottom + 18 * dpi);
    ctx.restore();
  }

  // Y-axis title (rotated) — データボックス左マージン内に配置
  if (yLabel) {
    ctx.save();
    ctx.font = `bold ${Math.max(8, Math.round(10 * dpi))}px sans-serif`;
    ctx.globalAlpha = 0.9;
    // tick ラベル幅 (~30px) + 余白を確保した位置に Y タイトルを配置
    const yTitleX = Math.max(8, (leftMarginPx - 32)) * dpi;
    ctx.translate(yTitleX, plotArea.top + plotArea.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
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

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function toSup(n) {
  return String(n).split("").map(c => (c === "-" ? "⁻" : SUPERSCRIPT[c]) ?? c).join("");
}
function fmtTick(v) {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  // Powers of 10: show as 10ⁿ
  if (abs >= 100) {
    const exp = Math.log10(abs);
    if (Math.abs(exp - Math.round(exp)) < 0.01) {
      return `${sign}10${toSup(Math.round(exp))}`;
    }
  }
  if (abs >= 1e4) return sign + (abs / 1000).toFixed(0) + "k";
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + "k";
  if (abs >= 100) return String(Math.round(v));
  if (abs >= 1)   return String(Math.round(v * 10) / 10);
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
