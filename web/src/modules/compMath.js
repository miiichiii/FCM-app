export function idx(n, from, to) {
  return to * n + from;
}

export function buildSpillMatrix(n, coeffs) {
  const matrix = new Float64Array(n * n);
  for (let to = 0; to < n; to++) {
    for (let from = 0; from < n; from++) {
      matrix[idx(n, from, to)] = from === to ? 1 : Number(coeffs[idx(n, from, to)] ?? 0);
    }
  }
  return matrix;
}

export function invertMatrix(matrix, n) {
  const left = new Float64Array(matrix);
  const right = new Float64Array(n * n);
  for (let i = 0; i < n; i++) right[idx(n, i, i)] = 1;

  for (let pivot = 0; pivot < n; pivot++) {
    let bestRow = pivot;
    let bestAbs = Math.abs(left[idx(n, pivot, pivot)]);
    for (let row = pivot + 1; row < n; row++) {
      const value = Math.abs(left[idx(n, pivot, row)]);
      if (value > bestAbs) {
        bestAbs = value;
        bestRow = row;
      }
    }

    if (bestAbs < 1e-12) throw new Error("Compensation matrix is singular");

    if (bestRow !== pivot) {
      swapRows(left, n, pivot, bestRow);
      swapRows(right, n, pivot, bestRow);
    }

    const pivotValue = left[idx(n, pivot, pivot)];
    for (let col = 0; col < n; col++) {
      left[idx(n, col, pivot)] /= pivotValue;
      right[idx(n, col, pivot)] /= pivotValue;
    }

    for (let row = 0; row < n; row++) {
      if (row === pivot) continue;
      const factor = left[idx(n, pivot, row)];
      if (Math.abs(factor) < 1e-12) continue;
      for (let col = 0; col < n; col++) {
        left[idx(n, col, row)] -= factor * left[idx(n, col, pivot)];
        right[idx(n, col, row)] -= factor * right[idx(n, col, pivot)];
      }
    }
  }

  return right;
}

export function buildCompensationTransform(n, coeffs) {
  return invertMatrix(buildSpillMatrix(n, coeffs), n);
}

export function buildTransformRows(transform, n, eps = 1e-12) {
  const rows = Array.from({ length: n }, () => []);
  for (let to = 0; to < n; to++) {
    for (let from = 0; from < n; from++) {
      const coeff = transform[idx(n, from, to)];
      if (Math.abs(coeff) > eps) rows[to].push({ from, coeff });
    }
  }
  return rows;
}

export function applyTransformValue(transformRows, toParam, rawChannels, eventIndex) {
  let value = 0;
  const row = transformRows[toParam] ?? [];
  for (let i = 0; i < row.length; i++) value += row[i].coeff * rawChannels[row[i].from][eventIndex];
  return value;
}

function swapRows(matrix, n, rowA, rowB) {
  if (rowA === rowB) return;
  for (let col = 0; col < n; col++) {
    const a = idx(n, col, rowA);
    const b = idx(n, col, rowB);
    const tmp = matrix[a];
    matrix[a] = matrix[b];
    matrix[b] = tmp;
  }
}
