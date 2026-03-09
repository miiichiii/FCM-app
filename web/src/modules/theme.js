const STORAGE_KEY = "fcm-app-theme";
const DEFAULT_THEME = "light";

export function initTheme() {
  return applyTheme(readStoredTheme());
}

export function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = nextTheme;
  try {
    localStorage.setItem(STORAGE_KEY, nextTheme);
  } catch {
    // Ignore storage failures; theme still applies for the current session.
  }
  return nextTheme;
}

export function toggleTheme() {
  return applyTheme(getCurrentTheme() === "dark" ? "light" : "dark");
}

export function getCurrentTheme() {
  return document.body.dataset.theme === "dark" ? "dark" : "light";
}

export function getThemeColors() {
  const styles = getComputedStyle(document.body);
  return {
    plotCanvasBg: readCssVar(styles, "--plot-canvas-bg", "rgba(8, 11, 18, 0.94)"),
    plotFrame: readCssVar(styles, "--plot-frame", "rgba(255, 255, 255, 0.16)"),
    plotPoint: readCssVar(styles, "--plot-point", "rgba(255, 255, 255, 0.55)"),
    plotText: readCssVar(styles, "--plot-text", "rgba(255, 255, 255, 0.74)"),
    plotGate: readCssVar(styles, "--plot-gate", "rgba(255, 255, 255, 0.3)"),
    plotGateSelected: readCssVar(styles, "--plot-gate-selected", "rgba(110, 168, 255, 0.95)"),
    plotDrag: readCssVar(styles, "--plot-drag", "rgba(255, 255, 255, 0.75)"),
    plotLoading: readCssVar(styles, "--plot-loading", "rgba(255, 255, 255, 0.1)"),
    reviewPoint: readCssVar(styles, "--review-point", "rgba(110, 168, 255, 0.65)"),
    densityAccent: readRgbTriplet(styles, "--density-accent-rgb", [110, 168, 255]),
    densityPeak: readRgbTriplet(styles, "--density-peak-rgb", [255, 255, 255]),
  };
}

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function readCssVar(styles, name, fallback) {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

function readRgbTriplet(styles, name, fallback) {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
  if (parts.length !== 3) return fallback;
  return parts.map((value) => Math.max(0, Math.min(255, Math.round(value))));
}
