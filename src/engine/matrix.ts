export type Matrix = number[][];

export function zeros(size: number): Matrix {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

export function identity(size: number): Matrix {
  const result = zeros(size);
  for (let index = 0; index < size; index += 1) result[index][index] = 1;
  return result;
}

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function transpose(matrix: Matrix): Matrix {
  if (matrix.length === 0) return [];
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

export function multiply(left: Matrix, right: Matrix): Matrix {
  if (left.length === 0 || right.length === 0) return [];
  if (left[0].length !== right.length) throw new Error("Matrix dimensions do not align.");
  const result = Array.from({ length: left.length }, () => Array<number>(right[0].length).fill(0));
  for (let row = 0; row < left.length; row += 1) {
    for (let shared = 0; shared < right.length; shared += 1) {
      const value = left[row][shared];
      if (value === 0) continue;
      for (let column = 0; column < right[0].length; column += 1) {
        result[row][column] += value * right[shared][column];
      }
    }
  }
  return result;
}

export function diagonal(values: readonly number[]): Matrix {
  const result = zeros(values.length);
  for (let index = 0; index < values.length; index += 1) result[index][index] = values[index];
  return result;
}

export function isFiniteMatrix(matrix: Matrix): boolean {
  return matrix.every((row) => row.every(Number.isFinite));
}

/** Pivoted Gauss–Jordan inverse; matrices here are capped at twelve square rows. */
export function inverse(matrix: Matrix): Matrix {
  const size = matrix.length;
  if (size === 0 || matrix.some((row) => row.length !== size)) {
    throw new Error("A non-empty square matrix is required.");
  }
  const augmented = matrix.map((row, index) => [...row, ...identity(size)[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let candidate = column + 1; candidate < size; candidate += 1) {
      if (Math.abs(augmented[candidate][column]) > Math.abs(augmented[pivot][column])) {
        pivot = candidate;
      }
    }
    if (!Number.isFinite(augmented[pivot][column]) || Math.abs(augmented[pivot][column]) < 1e-14) {
      throw new Error("Matrix is singular or numerically degenerate.");
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const pivotValue = augmented[column][column];
    for (let entry = 0; entry < size * 2; entry += 1) augmented[column][entry] /= pivotValue;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let entry = 0; entry < size * 2; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }

  return augmented.map((row) => row.slice(size));
}

export function relativeClose(left: number, right: number, tolerance = 1e-9): boolean {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

export function matricesClose(left: Matrix, right: Matrix, tolerance = 1e-9): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, rowIndex) =>
        row.length === right[rowIndex]?.length &&
        row.every((value, columnIndex) =>
          relativeClose(value, right[rowIndex][columnIndex], tolerance),
        ),
    )
  );
}

/**
 * Jacobi rotations for a real symmetric matrix. Covariance matrices are small,
 * so this stable, dependency-free eigensolver is enough for the guard and PSD
 * checks; it deliberately does not masquerade as a general numeric package.
 */
export function symmetricEigenvalues(matrix: Matrix): number[] {
  const size = matrix.length;
  if (size === 0 || matrix.some((row) => row.length !== size)) {
    throw new Error("A non-empty square matrix is required.");
  }
  const work = cloneMatrix(matrix);
  const maxIterations = size * size * 80;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let row = 0;
    let column = 1;
    let largest = 0;
    for (let currentRow = 0; currentRow < size; currentRow += 1) {
      for (let currentColumn = currentRow + 1; currentColumn < size; currentColumn += 1) {
        const magnitude = Math.abs(work[currentRow][currentColumn]);
        if (magnitude > largest) {
          largest = magnitude;
          row = currentRow;
          column = currentColumn;
        }
      }
    }
    if (largest < 1e-13) break;

    const diagonalDifference = work[column][column] - work[row][row];
    const angle = 0.5 * Math.atan2(2 * work[row][column], diagonalDifference);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rowDiagonal = work[row][row];
    const columnDiagonal = work[column][column];
    const offDiagonal = work[row][column];

    work[row][row] =
      cosine * cosine * rowDiagonal -
      2 * sine * cosine * offDiagonal +
      sine * sine * columnDiagonal;
    work[column][column] =
      sine * sine * rowDiagonal +
      2 * sine * cosine * offDiagonal +
      cosine * cosine * columnDiagonal;
    work[row][column] = 0;
    work[column][row] = 0;

    for (let index = 0; index < size; index += 1) {
      if (index === row || index === column) continue;
      const rowValue = work[index][row];
      const columnValue = work[index][column];
      work[index][row] = work[row][index] = cosine * rowValue - sine * columnValue;
      work[index][column] = work[column][index] = sine * rowValue + cosine * columnValue;
    }
  }
  return work.map((row, index) => row[index]);
}

export function isPositiveSemidefinite(matrix: Matrix, tolerance = 1e-9): boolean {
  const eigenvalues = symmetricEigenvalues(matrix);
  const scale = Math.max(1, ...eigenvalues.map(Math.abs));
  return eigenvalues.every((value) => value >= -tolerance * scale);
}
