import assert from "node:assert";
import test from "node:test";
import { createDefaultState } from "../web/src/state.js";
import { addGate, getGateAncestors, getGateById } from "../web/src/modules/gate.js";

// Mock window for Node.js environment
global.window = {
  dispatchEvent: () => {},
};

test("Gate hierarchy", () => {
  const state = createDefaultState();

  // Add a root gate
  addGate(state, { type: "rect", xParam: 0, yParam: 1, xMin: 0, xMax: 10, yMin: 0, yMax: 10 });
  assert.strictEqual(state.gates.length, 1);
  assert.strictEqual(state.selectedGateId, "1");

  const gate1 = getGateById(state, "1");
  assert.strictEqual(gate1.name, "Gate 1");
  assert.strictEqual(gate1.parentId, "root");

  // Add a child gate
  addGate(state, { type: "rect", xParam: 2, yParam: 3, xMin: 20, xMax: 30, yMin: 20, yMax: 30 });
  assert.strictEqual(state.gates.length, 2);
  assert.strictEqual(state.selectedGateId, "2");

  const gate2 = getGateById(state, "2");
  assert.strictEqual(gate2.name, "Gate 2");
  assert.strictEqual(gate2.parentId, "1");

  // Add another child gate to the first gate
  state.selectedGateId = "1";
  addGate(state, { type: "rect", xParam: 4, yParam: 5, xMin: 40, xMax: 50, yMin: 40, yMax: 50 });
  assert.strictEqual(state.gates.length, 3);
  assert.strictEqual(state.selectedGateId, "3");
  const gate3 = getGateById(state, "3");
  assert.strictEqual(gate3.parentId, "1");

  // Test ancestors
  const ancestors2 = getGateAncestors(state, "2");
  assert.strictEqual(ancestors2.length, 1);
  assert.strictEqual(ancestors2[0].id, "1");

  const ancestors3 = getGateAncestors(state, "3");
  assert.strictEqual(ancestors3.length, 1);
  assert.strictEqual(ancestors3[0].id, "1");
});
