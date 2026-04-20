import test from "node:test";
import assert from "node:assert/strict";
import { createCompModel } from "../web/src/modules/compModel.js";
import { buildSpillMatrix, idx } from "../web/src/modules/compMath.js";

test("compModel: applyPreviewValue resolves spillover matrix for a simple pair", () => {
  const comp = createCompModel(2, null);
  comp.setCoeff(0, 1, 0.1);

  const raw = [new Float32Array([100, 200]), new Float32Array([1010, 520])];
  const v0 = comp.applyPreviewValue(1, 0, raw);
  const v1 = comp.applyPreviewValue(1, 1, raw);

  assert.ok(Math.abs(v0 - 1000) < 1e-6);
  assert.ok(Math.abs(v1 - 500) < 1e-6);
});

test("compModel: changing one spillover can propagate into linked channels", () => {
  const comp = createCompModel(3, null);
  comp.setCoeff(0, 1, 0.5);
  comp.setCoeff(1, 2, 0.25);

  const truth = [120, 60, 15];
  const rawEvent = makeRawEvent(truth, comp.coeffs, 3);
  const raw = Array.from(rawEvent, (value) => new Float32Array([value]));

  assert.ok(Math.abs(comp.applyPreviewValue(0, 0, raw) - truth[0]) < 1e-6);
  assert.ok(Math.abs(comp.applyPreviewValue(1, 0, raw) - truth[1]) < 1e-6);
  assert.ok(Math.abs(comp.applyPreviewValue(2, 0, raw) - truth[2]) < 1e-6);

  const before = comp.applyPreviewValue(2, 0, raw);
  comp.setCoeff(0, 1, 0.6);
  const after = comp.applyPreviewValue(2, 0, raw);

  assert.notEqual(before, after);
  assert.ok(Math.abs(after - truth[2]) > 1e-3);
});

test("compModel: rejected singular update keeps previous valid state", () => {
  const comp = createCompModel(2, null);
  comp.setCoeff(0, 1, 0.25);

  const raw = [new Float32Array([100]), new Float32Array([125])];
  const before = comp.applyPreviewValue(1, 0, raw);

  const result = comp.setCoeff(1, 0, 4);

  assert.equal(result.ok, false);
  assert.match(comp.lastError, /singular/i);
  assert.equal(comp.getCoeff(0, 1), 0.25);
  assert.equal(comp.getCoeff(1, 0), 0);
  assert.ok(Math.abs(comp.applyPreviewValue(1, 0, raw) - before) < 1e-6);
});

function makeRawEvent(truth, coeffs, n) {
  const spill = buildSpillMatrix(n, coeffs);
  const raw = new Float64Array(n);
  for (let to = 0; to < n; to++) {
    let value = 0;
    for (let from = 0; from < n; from++) value += spill[idx(n, from, to)] * truth[from];
    raw[to] = value;
  }
  return raw;
}
