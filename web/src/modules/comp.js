import { createCompModel } from "./compModel.js";

export { createCompModel };

export function downloadCompJson(compModel) {
  const blob = new Blob([JSON.stringify(compModel.toJson(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "compensation.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadCompJsonFromFile(compModel, file) {
  const text = await file.text();
  const obj = JSON.parse(text);
  compModel.loadFromJson(obj);
}

export function compMatrixToCsv(compModel, params) {
  if (!compModel) throw new Error("Compensation model is required");
  const labels = getParamLabels(params, compModel.n);
  const lines = [];
  lines.push(toCsvLine(["to\\\\from", ...labels]));

  for (let to = 0; to < compModel.n; to++) {
    const row = [labels[to]];
    for (let from = 0; from < compModel.n; from++) {
      row.push(from === to ? "0" : String(compModel.getCoeff(from, to)));
    }
    lines.push(toCsvLine(row));
  }

  return `${lines.join("\n")}\n`;
}

export function loadCompCsvText(compModel, params, text) {
  if (!compModel) throw new Error("Compensation model is required");
  const rows = String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);

  if (rows.length < 2) throw new Error("CSV is empty");

  const labels = getParamLabels(params, compModel.n);
  const header = rows[0];
  if (header.length !== compModel.n + 1) {
    throw new Error(`CSV header length mismatch (expected ${compModel.n + 1}, got ${header.length})`);
  }

  const coeffs = new Float32Array(compModel.n * compModel.n);

  for (let to = 0; to < compModel.n; to++) {
    const row = rows[to + 1];
    if (!row) throw new Error(`CSV row ${to + 2} is missing`);
    if (row.length !== compModel.n + 1) {
      throw new Error(`CSV row ${to + 2} length mismatch (expected ${compModel.n + 1}, got ${row.length})`);
    }

    const rowLabel = row[0].trim();
    if (rowLabel && rowLabel !== labels[to]) {
      throw new Error(`CSV row ${to + 2} label mismatch (expected "${labels[to]}", got "${rowLabel}")`);
    }

    for (let from = 0; from < compModel.n; from++) {
      const raw = row[from + 1].trim();
      const value = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`CSV cell (${to + 2}, ${from + 2}) is not a number`);
      }
      if (from === to) continue;
      coeffs[to * compModel.n + from] = value;
    }
  }

  compModel.loadFromJson({
    version: 1,
    nParams: compModel.n,
    coeffs: Array.from(coeffs),
  });
}

export function downloadCompCsv(compModel, params, filename = "compensation-matrix.csv") {
  const blob = new Blob([compMatrixToCsv(compModel, params)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadCompCsvFromFile(compModel, params, file) {
  const text = await file.text();
  loadCompCsvText(compModel, params, text);
}

function getParamLabels(params, n) {
  return Array.from({ length: n }, (_, index) => params?.[index]?.label ?? params?.[index]?.name ?? `Param ${index + 1}`);
}

function toCsvLine(values) {
  return values.map(escapeCsvCell).join(",");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  out.push(current);
  return out;
}
