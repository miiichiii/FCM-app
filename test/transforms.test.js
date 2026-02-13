import test from "node:test";
import assert from "node:assert/strict";
import { inverseTransformValue, transformValue } from "../web/src/modules/transforms.js";

test("transforms: linear round-trip", () => {
  for (const x of [-1000, -1, 0, 1, 123.456, 1e6]) {
    const y = transformValue("linear", x, {});
    const xr = inverseTransformValue("linear", y, {});
    assert.equal(xr, x);
  }
});

test("transforms: arcsinh round-trip (approx)", () => {
  const params = { arcsinhCofactor: 150 };
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() - 0.5) * 2e5;
    const y = transformValue("arcsinh", x, params);
    const xr = inverseTransformValue("arcsinh", y, params);
    assert.ok(Math.abs(xr - x) / (1 + Math.abs(x)) < 1e-12);
  }
});

test("transforms: logicle(symlog) round-trip (approx)", () => {
  const params = { logicleLinthresh: 100 };
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() - 0.5) * 2e5;
    const y = transformValue("logicle", x, params);
    const xr = inverseTransformValue("logicle", y, params);
    assert.ok(Math.abs(xr - x) / (1 + Math.abs(x)) < 1e-12);
  }
});

