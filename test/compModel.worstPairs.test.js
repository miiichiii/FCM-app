import { createCompModel } from "../web/src/modules/compModel.js";
import assert from "node:assert";
import test from "node:test";

test("compModel: getWorstPairs returns sorted pairs", () => {
  const nParams = 4;
  const model = createCompModel(nParams);

  model.setCoeff(0, 1, 0.5);
  model.setCoeff(2, 3, -0.8);
  model.setCoeff(1, 2, 0.2);

  const worstPairs = model.getWorstPairs();

  assert.strictEqual(worstPairs.length, 3);

  assert.strictEqual(worstPairs[0].from, 2);
  assert.strictEqual(worstPairs[0].to, 3);
  assert.ok(Math.abs(worstPairs[0].coeff - -0.8) < 1e-6);

  assert.strictEqual(worstPairs[1].from, 0);
  assert.strictEqual(worstPairs[1].to, 1);
  assert.ok(Math.abs(worstPairs[1].coeff - 0.5) < 1e-6);

  assert.strictEqual(worstPairs[2].from, 1);
  assert.strictEqual(worstPairs[2].to, 2);
  assert.ok(Math.abs(worstPairs[2].coeff - 0.2) < 1e-6);
});
