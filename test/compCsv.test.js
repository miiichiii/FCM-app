import test from "node:test";
import assert from "node:assert/strict";

import { createCompModel, compMatrixToCsv, loadCompCsvText } from "../web/src/modules/comp.js";

test("compCsv: matrix round-trips through CSV", () => {
  const params = [
    { label: "FITC-A" },
    { label: "PE, TxRed-A" },
    { label: "APC-A" },
  ];

  const source = createCompModel(params.length, null);
  source.setCoeff(0, 1, 0.125);
  source.setCoeff(2, 1, -0.33);
  source.setCoeff(1, 2, 0.041);

  const csv = compMatrixToCsv(source, params);
  assert.match(csv, /"PE, TxRed-A"/);

  const loaded = createCompModel(params.length, null);
  loadCompCsvText(loaded, params, csv);

  assert.equal(loaded.getCoeff(0, 1), source.getCoeff(0, 1));
  assert.equal(loaded.getCoeff(2, 1), source.getCoeff(2, 1));
  assert.equal(loaded.getCoeff(1, 2), source.getCoeff(1, 2));
  assert.equal(loaded.getCoeff(1, 1), 0);
  assert.equal(loaded.dirty, false);
});

test("compCsv: rejects mismatched row labels", () => {
  const params = [{ label: "FL1-A" }, { label: "FL2-A" }];
  const model = createCompModel(params.length, null);
  const csv = "to\\\\from,FL1-A,FL2-A\nWRONG,0,0.1\nFL2-A,0.2,0\n";

  assert.throws(() => loadCompCsvText(model, params, csv), /label mismatch/);
});
