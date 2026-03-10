import test from "node:test";
import assert from "node:assert/strict";

import { createCompModel } from "../web/src/modules/comp.js";
import { createCompSnapshot, restoreCompSnapshot } from "../web/src/modules/compStore.js";

test("compStore: restores coefficients when channel set matches", () => {
  const params = [{ label: "FSC-A" }, { label: "FITC-A" }, { label: "PE-A" }];
  const source = createCompModel(params.length, null);
  source.setCoeff(1, 2, 0.18);
  source.setCoeff(2, 1, 0.04);

  const snapshot = createCompSnapshot(source, params);

  const target = createCompModel(params.length, null);
  const result = restoreCompSnapshot(target, params, snapshot);

  assert.equal(result.matched, true);
  assert.equal(result.restored, 2);
  assert.ok(Math.abs(target.getCoeff(1, 2) - 0.18) < 1e-6);
  assert.ok(Math.abs(target.getCoeff(2, 1) - 0.04) < 1e-6);
});

test("compStore: does not restore when channel signature differs", () => {
  const sourceParams = [{ label: "FITC-A" }, { label: "PE-A" }];
  const targetParams = [{ label: "FITC-A" }, { label: "APC-A" }];
  const source = createCompModel(sourceParams.length, null);
  source.setCoeff(0, 1, 0.22);

  const snapshot = createCompSnapshot(source, sourceParams);
  const target = createCompModel(targetParams.length, null);
  const result = restoreCompSnapshot(target, targetParams, snapshot);

  assert.equal(result.matched, false);
  assert.equal(result.restored, 0);
  assert.equal(target.getCoeff(0, 1), 0);
});
