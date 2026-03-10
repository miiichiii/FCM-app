export const COMP_INPUT_STEP = 0.001;
export const COMP_NUDGE_STEP = 0.01;

export function getCompSliderConfig(value) {
  const abs = Math.abs(Number.isFinite(value) ? value : 0);

  let span = 0.25;
  if (abs > 0.25) span = 0.5;
  if (abs > 0.5) span = 1;
  if (abs > 1) span = 2;
  if (abs > 2) span = 5;
  if (abs > 5) span = 10;

  return {
    min: -span,
    max: span,
    step: span <= 0.5 ? 0.0005 : COMP_INPUT_STEP,
  };
}

export function clampCompSliderValue(value, config = getCompSliderConfig(value)) {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(config.min, Math.min(config.max, numeric));
}

export function parseCompInput(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
