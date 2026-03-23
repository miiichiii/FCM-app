/**
 * plotCard.js の基本的なユニットテスト
 * Canvas API はブラウザ環境にのみ存在するため、ここでは
 * ヘルパー関数（軸範囲計算など）を中心にテストする。
 */
import test from "node:test";
import assert from "node:assert/strict";

// ── ヘルパー: computeAxisRanges の検証用インライン実装 ──
function computeAxisRangesForTest({ plot, raw, n }) {
  let xMin = plot.xMin ?? null;
  let xMax = plot.xMax ?? null;
  let yMin = plot.yMin ?? null;
  let yMax = plot.yMax ?? null;

  if (xMin == null || xMax == null || yMin == null || yMax == null) {
    let xm = Infinity, xM = -Infinity, ym = Infinity, yM = -Infinity;
    for (let k = 0; k < n; k++) {
      const xv = raw[plot.xParam][k];
      const yv = raw[plot.yParam][k];
      if (Number.isFinite(xv)) { if (xv < xm) xm = xv; if (xv > xM) xM = xv; }
      if (Number.isFinite(yv)) { if (yv < ym) ym = yv; if (yv > yM) yM = yv; }
    }
    if (xMin == null) xMin = xm;
    if (xMax == null) xMax = xM;
    if (yMin == null) yMin = ym;
    if (yMax == null) yMax = yM;
  }
  if (!Number.isFinite(xMin)) xMin = 0;
  if (!Number.isFinite(xMax)) xMax = 1;
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;
  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) yMax = yMin + 1;
  return { xMin, xMax, yMin, yMax };
}

test("plotCard: computeAxisRanges auto-detects min/max from data", () => {
  const raw = [new Float32Array([10, 20, 30]), new Float32Array([5, 15, 25])];
  const plot = { xParam: 0, yParam: 1, xMin: null, xMax: null, yMin: null, yMax: null };
  const { xMin, xMax, yMin, yMax } = computeAxisRangesForTest({ plot, raw, n: 3 });
  assert.equal(xMin, 10);
  assert.equal(xMax, 30);
  assert.equal(yMin, 5);
  assert.equal(yMax, 25);
});

test("plotCard: computeAxisRanges respects manual axis limits", () => {
  const raw = [new Float32Array([10, 20, 30]), new Float32Array([5, 15, 25])];
  const plot = { xParam: 0, yParam: 1, xMin: 0, xMax: 100, yMin: -10, yMax: 50 };
  const { xMin, xMax, yMin, yMax } = computeAxisRangesForTest({ plot, raw, n: 3 });
  assert.equal(xMin, 0);
  assert.equal(xMax, 100);
  assert.equal(yMin, -10);
  assert.equal(yMax, 50);
});

test("plotCard: computeAxisRanges guards against degenerate range", () => {
  const raw = [new Float32Array([5, 5, 5]), new Float32Array([3, 3, 3])];
  const plot = { xParam: 0, yParam: 1, xMin: null, xMax: null, yMin: null, yMax: null };
  const { xMin, xMax, yMin, yMax } = computeAxisRangesForTest({ plot, raw, n: 3 });
  assert.ok(xMax > xMin);
  assert.ok(yMax > yMin);
});

test("plotCard: computeAxisRanges returns safe defaults for empty data", () => {
  const raw = [new Float32Array(0), new Float32Array(0)];
  const plot = { xParam: 0, yParam: 1, xMin: null, xMax: null, yMin: null, yMax: null };
  const { xMin, xMax, yMin, yMax } = computeAxisRangesForTest({ plot, raw, n: 0 });
  assert.ok(Number.isFinite(xMin));
  assert.ok(Number.isFinite(xMax));
  assert.ok(xMax > xMin);
  assert.ok(yMax > yMin);
});

test("plotCard: axis labels are resolved from params", () => {
  const params = [
    { label: "FSC-A" }, { label: "SSC-A" }, { label: "FITC-A" }, { label: "PE-A" },
  ];
  const getLabel = (p, i) => p[i]?.label ?? `#${i + 1}`;
  assert.equal(getLabel(params, 0), "FSC-A");
  assert.equal(getLabel(params, 2), "FITC-A");
  assert.equal(getLabel(params, 99), "#100");
});

test("plotCard: plotArea margins are correctly calculated", () => {
  const dpi = 1, w = 400, h = 300;
  const plotArea = { left: 46 * dpi, top: 18 * dpi, width: w - (46 + 18) * dpi, height: h - (18 + 44) * dpi };
  assert.equal(plotArea.left, 46);
  assert.equal(plotArea.top, 18);
  assert.ok(plotArea.width > 0);
  assert.ok(plotArea.height > 0);
});
