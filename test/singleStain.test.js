import test from "node:test";
import assert from "node:assert/strict";
import {
  getCompRelevantParamIndices,
  inferStainedChannelFromFileName,
  mapReferenceParamsToSample,
} from "../web/src/modules/singleStain.js";

const params = [
  { name: "FSC-H", label: "FSC-H" },
  { name: "FSC-A", label: "FSC-A" },
  { name: "SSC-A", label: "SSC-A" },
  { name: "FL1-H", label: "FITC-H" },
  { name: "FL1-A", label: "FITC-A" },
  { name: "FL2-H", label: "PE-H" },
  { name: "FL2-A", label: "PE-A" },
  { name: "FL5-A", label: "APC-A" },
  { name: "FL7-A", label: "APC-A750-A" },
  { name: "FL8-A", label: "PB450-A" },
  { name: "Time", label: "Time" },
];

test("singleStain: compensation channel selection keeps fluorescence area channels", () => {
  assert.deepEqual(getCompRelevantParamIndices(params), [4, 6, 7, 8, 9]);
});

test("singleStain: filename inference maps common fluor names", () => {
  const indices = getCompRelevantParamIndices(params);

  assert.deepEqual(inferStainedChannelFromFileName("CD45.1_APC.fcs", params, indices), {
    index: 7,
    confidence: "high",
    reason: "filename-match",
  });
  assert.deepEqual(inferStainedChannelFromFileName("gr1-PE.fcs", params, indices), {
    index: 6,
    confidence: "high",
    reason: "filename-match",
  });
  assert.deepEqual(inferStainedChannelFromFileName("GFP1.fcs", params, indices), {
    index: 4,
    confidence: "high",
    reason: "filename-match",
  });
  assert.deepEqual(inferStainedChannelFromFileName("dapi.fcs", params, indices), {
    index: 9,
    confidence: "high",
    reason: "filename-match",
  });
  assert.deepEqual(inferStainedChannelFromFileName("unstain.fcs", params, indices), {
    index: null,
    confidence: "none",
    reason: "unstained-file",
  });
});

test("singleStain: reference params map onto sample params by alias", () => {
  const reference = [
    { name: "FL1-A", label: "FITC-A" },
    { name: "FL5-A", label: "APC-A" },
    { name: "FL8-A", label: "PB450-A" },
  ];
  const sample = [
    { name: "FL8-A", label: "PB450-A" },
    { name: "FL5-A", label: "APC-A" },
    { name: "FL1-A", label: "FITC-A" },
  ];

  const map = mapReferenceParamsToSample(reference, sample);
  assert.equal(map.get(0), 2);
  assert.equal(map.get(1), 1);
  assert.equal(map.get(2), 0);
});
