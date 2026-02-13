import test from "node:test";
import assert from "node:assert/strict";
import { createCompModel } from "../web/src/modules/compModel.js";

test("compModel: applyPreviewValue subtracts spillover", () => {
  const comp = createCompModel(2, null);
  // subtract param0 from param1
  comp.setCoeff(0, 1, 0.1);

  const raw = [new Float32Array([100, 200]), new Float32Array([1000, 500])];
  const v0 = comp.applyPreviewValue(1, 0, raw);
  const v1 = comp.applyPreviewValue(1, 1, raw);

  assert.ok(Math.abs(v0 - (1000 - 0.1 * 100)) < 1e-6);
  assert.ok(Math.abs(v1 - (500 - 0.1 * 200)) < 1e-6);
});
