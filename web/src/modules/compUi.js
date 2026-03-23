export const COMP_INPUT_STEP = 0.001;
export const COMP_NUDGE_STEP = 0.01;

// FlowJo / FACSDiva は -100% 〜 +100% (係数 -1 〜 +1) を基本レンジとする。
// 超過した場合は自動的にレンジを拡張する。
export function getCompSliderConfig(value) {
  const abs = Math.abs(Number.isFinite(value) ? value : 0);

  let span = 1.0;   // 旧: 0.25 → FlowJo 基準の -100%〜+100% に変更
  if (abs > 1.0) span = 2;
  if (abs > 2) span = 5;
  if (abs > 5) span = 10;

  return {
    min: -span,
    max: span,
    step: span <= 1 ? 0.005 : COMP_INPUT_STEP,
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
