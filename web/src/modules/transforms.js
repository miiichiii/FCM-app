export function linear(x) {
  return x;
}

export function invLinear(y) {
  return y;
}

export function arcsinh(x, cofactor) {
  const c = Number.isFinite(cofactor) && cofactor > 0 ? cofactor : 150;
  return Math.asinh(x / c);
}

export function invArcsinh(y, cofactor) {
  const c = Number.isFinite(cofactor) && cofactor > 0 ? cofactor : 150;
  return Math.sinh(y) * c;
}

// MVP-friendly "logicle-like" transform: symmetric log (symlog base10).
// This is not a full Parks logicle implementation, but it is monotone and handles negatives safely.
export function symlog10(x, linthresh) {
  const t = Number.isFinite(linthresh) && linthresh > 0 ? linthresh : 100;
  const ax = Math.abs(x);
  const y = Math.log10(1 + ax / t);
  return x < 0 ? -y : y;
}

export function invSymlog10(y, linthresh) {
  const t = Number.isFinite(linthresh) && linthresh > 0 ? linthresh : 100;
  const ay = Math.abs(y);
  const x = (10 ** ay - 1) * t;
  return y < 0 ? -x : x;
}

export function transformValue(scale, x, params) {
  switch (scale) {
    case "linear":
      return linear(x);
    case "arcsinh":
      return arcsinh(x, params?.arcsinhCofactor);
    case "logicle":
      return symlog10(x, params?.logicleLinthresh);
    default:
      return linear(x);
  }
}

export function inverseTransformValue(scale, y, params) {
  switch (scale) {
    case "linear":
      return invLinear(y);
    case "arcsinh":
      return invArcsinh(y, params?.arcsinhCofactor);
    case "logicle":
      return invSymlog10(y, params?.logicleLinthresh);
    default:
      return invLinear(y);
  }
}

