import { updateAllPlots } from "../state.js";
import { transformValue } from "./transforms.js";
import { gateFromPixelRect, gateToPixelRect, addGate, getGateById, getGateAncestors } from "./gate.js";

export function createPlotCard(state, plot, onActivate) {
  const el = document.createElement("div");
  el.className = "plot-card";

  const header = document.createElement("div");
  header.className = "plot-header";

  const xSel = document.createElement("select");
  const ySel = document.createElement("select");
  const scaleSel = document.createElement("select");
  scaleSel.innerHTML = `
    <option value="linear">linear</option>
    <option value="logicle">logicle</option>
    <option value="arcsinh">arcsinh</option>
  `;
  const modeSel = document.createElement("select");
  modeSel.innerHTML = `
    <option value="scatter">scatter</option>
    <option value="density">density</option>
  `;

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-secondary";
  removeBtn.textContent = "Remove";

  header.append(wrapField("X", xSel), wrapField("Y", ySel), wrapField("Scale", scaleSel), wrapField("Mode", modeSel), removeBtn);

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

  const footer = document.createElement("div");
  footer.className = "plot-footer";
  const xMinInput = createNumberInput("xMin");
  const xMaxInput = createNumberInput("xMax");
  const yMinInput = createNumberInput("yMin");
  const yMaxInput = createNumberInput("yMax");
  const autoBtn = document.createElement("button");
  autoBtn.className = "btn btn-secondary";
  autoBtn.textContent = "Auto range";

  footer.append(
    wrapField("X min", xMinInput),
    wrapField("X max", xMaxInput),
    wrapField("Y min", yMinInput),
    wrapField("Y max", yMaxInput),
    autoBtn,
  );

  el.append(header, canvasWrap, footer);

  // Active plot selection
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

  xSel.addEventListener("change", () => {
    plot.xParam = Number(xSel.value);
    updateAllPlots(state);
  });
  ySel.addEventListener("change", () => {
    plot.yParam = Number(ySel.value);
    updateAllPlots(state);
  });
  scaleSel.addEventListener("change", () => {
    plot.scale = scaleSel.value;
    updateAllPlots(state);
  });
  modeSel.addEventListener("change", () => {
    plot.mode = modeSel.value;
    updateAllPlots(state);
  });

  function syncRangeInputs() {
    xMinInput.value = plot.xMin ?? "";
    xMaxInput.value = plot.xMax ?? "";
    yMinInput.value = plot.yMin ?? "";
    yMaxInput.value = plot.yMax ?? "";
  }

  for (const inp of [xMinInput, xMaxInput, yMinInput, yMaxInput]) {
    inp.addEventListener("change", () => {
      const xMin = toNumberOrNull(xMinInput.value);
      const xMax = toNumberOrNull(xMaxInput.value);
      const yMin = toNumberOrNull(yMinInput.value);
      const yMax = toNumberOrNull(yMaxInput.value);

      plot.xMin = xMin != null && xMax != null ? Math.min(xMin, xMax) : xMin;
      plot.xMax = xMin != null && xMax != null ? Math.max(xMin, xMax) : xMax;
      plot.yMin = yMin != null && yMax != null ? Math.min(yMin, yMax) : yMin;
      plot.yMax = yMin != null && yMax != null ? Math.max(yMin, yMax) : yMax;
      updateAllPlots(state);
    });
  }

  autoBtn.addEventListener("click", () => {
    plot.xMin = null;
    plot.xMax = null;
    plot.yMin = null;
    plot.yMax = null;
    syncRangeInputs();
    updateAllPlots(state);
  });

  // Gate drawing
  let dragging = null; // {x0,y0,x1,y1}
  let lastGeom = null; // used for pixel->data conversion

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
    dragging.x1 = pt.x;
    dragging.y1 = pt.y;
    render();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    const pt = toCanvasPoint(canvas, e);
    dragging.x1 = pt.x;
    dragging.y1 = pt.y;

    const dx = Math.abs(dragging.x1 - dragging.x0);
    const dy = Math.abs(dragging.y1 - dragging.y0);
    if (dx >= 4 && dy >= 4) {
      const gateDef = gateFromPixelRect({
        plot,
        pixelRect: dragging,
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
  densityCanvas.width = 128;
  densityCanvas.height = 128;
  const densityCtx = densityCanvas.getContext("2d");

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
    xSel.innerHTML = params.map((p, i) => `<option value="${i}">${p.label}</option>`).join("");
    ySel.innerHTML = params.map((p, i) => `<option value="${i}">${p.label}</option>`).join("");
    xSel.value = String(plot.xParam);
    ySel.value = String(plot.yParam);
    scaleSel.value = plot.scale;
    modeSel.value = plot.mode;

    syncRangeInputs();

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

    const plotArea = {
      left: 46 * dpi,
      top: 18 * dpi,
      width: w - (46 + 18) * dpi,
      height: h - (18 + 44) * dpi,
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

    // Axes frame
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
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
        // Use worker for full-data density
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
              const [r, g, b, a] = densityColor(t);
              const o = i * 4;
              out[o + 0] = r;
              out[o + 1] = g;
              out[o + 2] = b;
              out[o + 3] = a;
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
            state.fullWorker.postMessage({
              type: "density",
              requestId,
              plotId: plot.id,
              key,
              xParam: plot.xParam,
              yParam: plot.yParam,
              scale: plot.scale,
              axisRanges,
              scaleParams,
              gates: gateDefs,
              binsW: densityCanvas.width,
              binsH: densityCanvas.height,
            });
          }
          // Show loading state
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${14 * dpi}px sans-serif`;
          ctx.fillText("Loading full density…", plotArea.left + plotArea.width / 2, plotArea.top + plotArea.height / 2);
          totalN = state.dataset.nEvents;
          usedN = 0;
        }
      } else {
        // Fallback to preview density
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
          const binIdx = by * binsW + bx;
          const c = ++counts[binIdx];
          if (c > maxCount) maxCount = c;
          usedN++;
        }

        if (densityCtx) {
          const img = densityCtx.createImageData(binsW, binsH);
          const out = img.data;
          const denom = Math.log(1 + maxCount);
          for (let i = 0; i < counts.length; i++) {
            const c = counts[i];
            const t = denom > 0 ? Math.log(1 + c) / denom : 0;
            const [r, g, b, a] = densityColor(t);
            const o = i * 4;
            out[o + 0] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = a;
          }
          densityCtx.putImageData(img, 0, 0);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(densityCanvas, plotArea.left, plotArea.top, plotArea.width, plotArea.height);
          ctx.restore();
        }
      }
    } else {
      // Scatter (preview)
      ctx.fillStyle = "rgba(255,255,255,0.55)";
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
        ctx.strokeStyle = isSelected ? "rgba(110,168,255,0.95)" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = Math.max(isSelected ? 2 : 1, (isSelected ? 2 : 1) * dpi);
        ctx.strokeRect(
          Math.min(gateRect.x0, gateRect.x1),
          Math.min(gateRect.y0, gateRect.y1),
          Math.abs(gateRect.x1 - gateRect.x0),
          Math.abs(gateRect.y1 - gateRect.y0),
        );
      }
    }
    
    // Dragging rect overlay
    if (dragging) {
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = Math.max(2, 2 * dpi);
      ctx.setLineDash([6 * dpi, 4 * dpi]);
      ctx.strokeRect(
        Math.min(dragging.x0, dragging.x1),
        Math.min(dragging.y0, dragging.y1),
        Math.abs(dragging.x1 - dragging.x0),
        Math.abs(dragging.y1 - dragging.y0),
      );
      ctx.setLineDash([]);
    }

    const xLabel = params[plot.xParam]?.label ?? `#${plot.xParam + 1}`;
    const yLabel = params[plot.yParam]?.label ?? `#${plot.yParam + 1}`;
    overlayLeft.textContent = `${xLabel} vs ${yLabel}`;
    const modeLabel = plot.mode === "density" ? "density" : "scatter";
    const canUseFull = state.fullApply.status === "done" && state.fullApply.appliedRevision === state.compRevision;
    const scopeLabel = (plot.mode === "density" && canUseFull) ? "full" : (dataset.nEvents > totalN ? "preview" : "full");
    const gateLabel = selectedGate ? `, ${selectedGate.name}` : "";
    let msg = `N=${usedN.toLocaleString()}/${totalN.toLocaleString()} (${modeLabel}, ${scopeLabel}${gateLabel})`;
    if (scopeLabel === "preview") msg += ` of ${dataset.nEvents.toLocaleString()}`;
    overlayRight.textContent = msg;
  }

  return { el, render };
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

function createNumberInput(name) {
  const i = document.createElement("input");
  i.type = "number";
  i.name = name;
  i.placeholder = "auto";
  i.step = "any";
  return i;
}

function toNumberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toCanvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const dpi = window.devicePixelRatio || 1;
  return {
    x: (e.clientX - rect.left) * dpi,
    y: (e.clientY - rect.top) * dpi,
  };
}

function clampInt(x, min, max) {
  const xi = x | 0;
  return Math.max(min, Math.min(max, xi));
}

function densityColor(t) {
  const tt = Math.max(0, Math.min(1, Math.sqrt(t)));
  if (tt <= 0) return [0, 0, 0, 0];
  const a = Math.max(0, Math.min(255, Math.floor(255 * Math.min(1, tt * 1.25))));

  // Dark -> accent -> white
  const accent = [110, 168, 255];
  if (tt < 0.7) {
    const u = tt / 0.7;
    return [lerpInt(0, accent[0], u), lerpInt(0, accent[1], u), lerpInt(0, accent[2], u), a];
  }
  const u = (tt - 0.7) / 0.3;
  return [lerpInt(accent[0], 255, u), lerpInt(accent[1], 255, u), lerpInt(accent[2], 255, u), a];
}

function lerpInt(a, b, t) {
  return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function computeAxisRanges({ plot, raw, n, comp }) {
  let xMin = plot.xMin;
  let xMax = plot.xMax;
  let yMin = plot.yMin;
  let yMax = plot.yMax;

  if (xMin == null || xMax == null || yMin == null || yMax == null) {
    let xm = Infinity;
    let xM = -Infinity;
    let ym = Infinity;
    let yM = -Infinity;
    for (let k = 0; k < n; k++) {
      const xv = comp ? comp.applyPreviewValue(plot.xParam, k, raw) : raw[plot.xParam][k];
      const yv = comp ? comp.applyPreviewValue(plot.yParam, k, raw) : raw[plot.yParam][k];
      if (Number.isFinite(xv)) {
        if (xv < xm) xm = xv;
        if (xv > xM) xM = xv;
      }
      if (Number.isFinite(yv)) {
        if (yv < ym) ym = yv;
        if (yv > yM) yM = yv;
      }
    }
    if (xMin == null) xMin = xm;
    if (xMax == null) xMax = xM;
    if (yMin == null) yMin = ym;
    if (yMax == null) yMax = yM;
  }

  // Guard against degenerate ranges
  if (!Number.isFinite(xMin)) xMin = 0;
  if (!Number.isFinite(xMax)) xMax = 1;
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;

  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) yMax = yMin + 1;

  return { xMin, xMax, yMin, yMax };
}
