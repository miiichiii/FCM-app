export function createPlotState(init = {}) {
  return {
    id: makePlotId(),
    xParam: Number.isFinite(init.xParam) ? init.xParam : 0,
    yParam: Number.isFinite(init.yParam) ? init.yParam : 1,
    xScale: init.xScale ?? init.scale ?? "linear",
    yScale: init.yScale ?? init.scale ?? "linear",
    mode: init.mode ?? "scatter",
    xMin: init.xMin ?? null,
    xMax: init.xMax ?? null,
    yMin: init.yMin ?? null,
    yMax: init.yMax ?? null,
    arcsinhCofactor: init.arcsinhCofactor ?? 150,
    logicleLinthresh: init.logicleLinthresh ?? 100,
  };
}

function makePlotId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `plot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
