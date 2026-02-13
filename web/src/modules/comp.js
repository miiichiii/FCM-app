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

