export function createPlotState(init = {}) {
  return {
    id: crypto.randomUUID(),
    xParam: Number.isFinite(init.xParam) ? init.xParam : 0,
    yParam: Number.isFinite(init.yParam) ? init.yParam : 1,
    scale: init.scale ?? "linear",
    mode: init.mode ?? "scatter",
    xMin: init.xMin ?? null,
    xMax: init.xMax ?? null,
    yMin: init.yMin ?? null,
    yMax: init.yMax ?? null,
    arcsinhCofactor: init.arcsinhCofactor ?? 150,
    logicleLinthresh: init.logicleLinthresh ?? 100,
  };
}

