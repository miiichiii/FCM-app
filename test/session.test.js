import test from "node:test";
import assert from "node:assert/strict";
import { createAnalysisSession, applyAnalysisSession, buildDatasetSignature } from "../web/src/modules/session.js";
import { createCompModel } from "../web/src/modules/compModel.js";
import { createPlotState } from "../web/src/modules/plotState.js";

function makeState() {
  const params = [
    { name: "FSC-A", label: "FSC-A" },
    { name: "FITC-A", label: "FITC-A" },
    { name: "PE-A", label: "PE-A" },
  ];
  const comp = createCompModel(params.length, null);
  comp.setCoeff(1, 2, 0.125);
  comp.selectedFrom = 1;
  comp.selectedTo = 2;

  const plot = createPlotState({
    xParam: 1,
    yParam: 2,
    xScale: "arcsinh",
    yScale: "linear",
    xMin: 10,
    xMax: 1000,
    yMin: -50,
    yMax: 500,
    mode: "density",
  });

  return {
    dataset: {
      name: "sample.fcs",
      version: "FCS3.1",
      nEvents: 1234,
      sha256: "abc123",
      params,
    },
    comp,
    activePlotId: plot.id,
    plots: [plot],
    gates: [{
      id: "1",
      name: "Cells",
      parentId: "root",
      definition: { type: "rect", xParam: 1, yParam: 2, xMin: 10, xMax: 100, yMin: 20, yMax: 200 },
    }],
    selectedGateId: "1",
    nextGateId: 2,
    singleStain: {
      activeSampleId: "s1",
      samples: [{
        id: "s1",
        fileName: "fitc-control.fcs",
        sha256: "ss-hash-1",
        stainedReferenceIndex: 1,
        inferenceConfidence: "high",
        inferenceReason: "filename-match",
      }],
    },
  };
}

test("session: createAnalysisSession captures reproducible analysis state", () => {
  const state = makeState();
  const session = createAnalysisSession(state);

  assert.equal(session.version, 2);
  assert.equal(session.dataset.sha256, "abc123");
  assert.equal(session.compensation.matrix.nParams, 3);
  assert.equal(session.plots.length, 1);
  assert.equal(session.gates.items.length, 1);
  assert.deepEqual(session.singleStain.assignments, [{
    fileName: "fitc-control.fcs",
    sha256: "ss-hash-1",
    stainedReferenceIndex: 1,
  }]);
});

test("session: applyAnalysisSession restores plots, gates, comp, and single-stain assignments", () => {
  const source = makeState();
  const session = createAnalysisSession(source);

  const target = makeState();
  target.comp = createCompModel(target.dataset.params.length, null);
  target.plots = [];
  target.gates = [];
  target.selectedGateId = "root";
  target.singleStain.samples[0].stainedReferenceIndex = null;
  target.singleStain.samples[0].inferenceConfidence = "none";
  target.singleStain.samples[0].inferenceReason = "no-match";

  const restored = applyAnalysisSession(target, session);

  assert.equal(target.comp.getCoeff(1, 2), 0.125);
  assert.equal(target.selectedGateId, "1");
  assert.equal(target.gates.length, 1);
  assert.equal(target.singleStain.samples[0].stainedReferenceIndex, 1);
  assert.equal(target.singleStain.samples[0].inferenceReason, "manual");
  assert.equal(restored.plots.length, 1);
  assert.equal(restored.activePlotId, restored.plots[0].id);
});

test("session: single-stain restore matches by sha256 before file name", () => {
  const source = makeState();
  const session = createAnalysisSession(source);

  const target = makeState();
  target.singleStain.samples = [{
    id: "s2",
    fileName: "renamed-control.fcs",
    sha256: "ss-hash-1",
    stainedReferenceIndex: null,
    inferenceConfidence: "none",
    inferenceReason: "no-match",
  }];
  target.singleStain.activeSampleId = null;

  applyAnalysisSession(target, session);

  assert.equal(target.singleStain.samples[0].stainedReferenceIndex, 1);
  assert.equal(target.singleStain.samples[0].inferenceReason, "manual");
  assert.equal(target.singleStain.activeSampleId, "s2");
});

test("session: dataset signature includes sha256 when available", () => {
  const state = makeState();
  const withHash = buildDatasetSignature(state.dataset);
  const withoutHash = buildDatasetSignature({ ...state.dataset, sha256: "" });

  assert.notEqual(withHash, withoutHash);
});
