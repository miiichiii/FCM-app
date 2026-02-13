import { inverseTransformValue, transformValue } from "./transforms.js";

export function armGating(state) {
  state.gatingArmed = true;
  window.dispatchEvent(new Event("gate-hierarchy-changed"));
}

export function clearAllGates(state) {
  state.gates = [];
  state.selectedGateId = "root";
  state.nextGateId = 1;
  state.gatingArmed = false;
  window.dispatchEvent(new Event("gate-hierarchy-changed"));
}

export function addGate(state, definition) {
  const newGate = {
    id: String(state.nextGateId++),
    name: `Gate ${state.nextGateId - 1}`,
    parentId: state.selectedGateId,
    definition,
  };
  state.gates.push(newGate);
  state.selectedGateId = newGate.id;
  state.gatingArmed = false;
  window.dispatchEvent(new Event("gate-hierarchy-changed"));
}

export function getGateById(state, id) {
  if (id === "root") return { id: "root", name: "All Events", parentId: null };
  return state.gates.find((g) => g.id === id);
}

export function getGateAncestors(state, gateId) {
  const ancestors = [];
  let current = getGateById(state, gateId);
  while (current && current.parentId && current.parentId !== "root") {
    current = getGateById(state, current.parentId);
    if (current) ancestors.push(current);
  }
  return ancestors;
}

export function gateFromPixelRect({ plot, pixelRect, plotArea, axisRanges, scaleParams }) {
  const { left, top, width, height } = plotArea;
  const x0 = clamp(pixelRect.x0, left, left + width);
  const x1 = clamp(pixelRect.x1, left, left + width);
  const y0 = clamp(pixelRect.y0, top, top + height);
  const y1 = clamp(pixelRect.y1, top, top + height);

  const xMinT = transformValue(plot.scale, axisRanges.xMin, scaleParams);
  const xMaxT = transformValue(plot.scale, axisRanges.xMax, scaleParams);
  const yMinT = transformValue(plot.scale, axisRanges.yMin, scaleParams);
  const yMaxT = transformValue(plot.scale, axisRanges.yMax, scaleParams);

  const tx0 = lerp(xMinT, xMaxT, (Math.min(x0, x1) - left) / width);
  const tx1 = lerp(xMinT, xMaxT, (Math.max(x0, x1) - left) / width);
  const ty0 = lerp(yMaxT, yMinT, (Math.min(y0, y1) - top) / height);
  const ty1 = lerp(yMaxT, yMinT, (Math.max(y0, y1) - top) / height);

  const rx0 = inverseTransformValue(plot.scale, tx0, scaleParams);
  const rx1 = inverseTransformValue(plot.scale, tx1, scaleParams);
  const ry0 = inverseTransformValue(plot.scale, ty0, scaleParams);
  const ry1 = inverseTransformValue(plot.scale, ty1, scaleParams);

  const xMin = Math.min(rx0, rx1);
  const xMax = Math.max(rx0, rx1);
  const yMin = Math.min(ry0, ry1);
  const yMax = Math.max(ry0, ry1);

  return {
    type: "rect",
    xParam: plot.xParam,
    yParam: plot.yParam,
    xMin,
    xMax,
    yMin,
    yMax,
  };
}

export function gateToPixelRect({ gate, plot, plotArea, axisRanges, scaleParams }) {
  if (!gate || gate.type !== "rect") return null;
  if (gate.xParam !== plot.xParam || gate.yParam !== plot.yParam) return null;

  const { left, top, width, height } = plotArea;

  const xMinT = transformValue(plot.scale, axisRanges.xMin, scaleParams);
  const xMaxT = transformValue(plot.scale, axisRanges.xMax, scaleParams);
  const yMinT = transformValue(plot.scale, axisRanges.yMin, scaleParams);
  const yMaxT = transformValue(plot.scale, axisRanges.yMax, scaleParams);

  const gx0T = transformValue(plot.scale, gate.xMin, scaleParams);
  const gx1T = transformValue(plot.scale, gate.xMax, scaleParams);
  const gy0T = transformValue(plot.scale, gate.yMin, scaleParams);
  const gy1T = transformValue(plot.scale, gate.yMax, scaleParams);

  const x0 = left + ((gx0T - xMinT) / (xMaxT - xMinT)) * width;
  const x1 = left + ((gx1T - xMinT) / (xMaxT - xMinT)) * width;
  const y0 = top + (1 - (gy0T - yMinT) / (yMaxT - yMinT)) * height;
  const y1 = top + (1 - (gy1T - yMinT) / (yMaxT - yMinT)) * height;

  return { x0, y0, x1, y1 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

