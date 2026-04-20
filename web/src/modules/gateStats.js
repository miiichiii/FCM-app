export function computeGateStatsFromChannels({ channels, nEvents, gates }) {
  const total = Number(nEvents ?? 0);
  const normalizedGates = Array.isArray(gates) ? gates : [];
  const gateById = new Map(normalizedGates.map((gate) => [gate.id, gate]));
  const chains = normalizedGates.map((gate) => ({
    gate,
    defs: buildGateDefinitionChain(gate, gateById),
  }));

  const countById = new Map([["root", total]]);
  for (const gate of normalizedGates) countById.set(gate.id, 0);

  for (let eventIndex = 0; eventIndex < total; eventIndex++) {
    for (const chain of chains) {
      if (passesDefinitionChain(channels, eventIndex, chain.defs)) {
        countById.set(chain.gate.id, countById.get(chain.gate.id) + 1);
      }
    }
  }

  const rows = [{
    id: "root",
    name: "All Events",
    parentId: null,
    count: total,
    parentCount: total,
    pctParent: total > 0 ? 100 : 0,
    pctTotal: total > 0 ? 100 : 0,
  }];

  for (const gate of normalizedGates) {
    const count = countById.get(gate.id) ?? 0;
    const parentCount = gate.parentId && gate.parentId !== "root"
      ? (countById.get(gate.parentId) ?? 0)
      : total;
    rows.push({
      id: gate.id,
      name: gate.name ?? gate.id,
      parentId: gate.parentId ?? "root",
      count,
      parentCount,
      pctParent: parentCount > 0 ? (count / parentCount) * 100 : 0,
      pctTotal: total > 0 ? (count / total) * 100 : 0,
    });
  }

  return rows;
}

export function gateStatsToCsv(rows) {
  const lines = [["Gate", "Parent", "Count", "%Parent", "%Total"]];
  for (const row of rows ?? []) {
    lines.push([
      row.name ?? row.id ?? "",
      row.parentId ?? "",
      String(row.count ?? 0),
      formatPercent(row.pctParent),
      formatPercent(row.pctTotal),
    ]);
  }
  return `${lines.map((line) => line.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function buildGateDefinitionChain(gate, gateById) {
  const defs = [];
  let current = gate;
  while (current) {
    if (current.definition) defs.push(current.definition);
    if (!current.parentId || current.parentId === "root") break;
    current = gateById.get(current.parentId);
  }
  defs.reverse();
  return defs;
}

function passesDefinitionChain(channels, eventIndex, defs) {
  for (const def of defs) {
    if (!def || def.type !== "rect") continue;
    const gx = channels[def.xParam]?.[eventIndex];
    const gy = channels[def.yParam]?.[eventIndex];
    if (!(gx >= def.xMin && gx <= def.xMax && gy >= def.yMin && gy <= def.yMax)) return false;
  }
  return true;
}

function formatPercent(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "";
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}
