import test from "node:test";
import assert from "node:assert/strict";
import { computeGateStatsFromChannels, gateStatsToCsv } from "../web/src/modules/gateStats.js";

test("gateStats: computes exact counts with parent percentages", () => {
  const channels = [
    new Float32Array([1, 3, 7, 9]),
    new Float32Array([1, 3, 7, 9]),
  ];
  const gates = [
    {
      id: "1",
      name: "Low",
      parentId: "root",
      definition: { type: "rect", xParam: 0, yParam: 1, xMin: 0, xMax: 5, yMin: 0, yMax: 5 },
    },
    {
      id: "2",
      name: "Low-tight",
      parentId: "1",
      definition: { type: "rect", xParam: 0, yParam: 1, xMin: 2, xMax: 4, yMin: 2, yMax: 4 },
    },
  ];

  const rows = computeGateStatsFromChannels({ channels, nEvents: 4, gates });

  assert.deepEqual(rows.map((row) => row.name), ["All Events", "Low", "Low-tight"]);
  assert.equal(rows[0].count, 4);
  assert.equal(rows[1].count, 2);
  assert.equal(rows[1].pctTotal, 50);
  assert.equal(rows[2].count, 1);
  assert.equal(rows[2].pctParent, 50);
  assert.equal(rows[2].pctTotal, 25);
});

test("gateStats: CSV export includes percentages", () => {
  const csv = gateStatsToCsv([
    { name: "All Events", parentId: null, count: 100, pctParent: 100, pctTotal: 100 },
    { name: "LSK", parentId: "root", count: 25, pctParent: 25, pctTotal: 25 },
  ]);

  assert.match(csv, /Gate,Parent,Count,%Parent,%Total/);
  assert.match(csv, /LSK,root,25,25\.000,25\.000/);
});
