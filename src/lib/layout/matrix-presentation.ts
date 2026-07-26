export type MatrixCellRole = "header" | "category" | "cell";

/** Keep Matrix divisions legible at normal canvas and export scales. */
export const MATRIX_DIVISION_BORDER_MIN_WIDTH = 1.5;
export const MATRIX_DIVISION_FRAME_BORDER_WIDTH = 2;
export const MATRIX_DIVISION_FRAME_RADIUS = 16;

/**
 * Matrix is presented as a grouped card system rather than a spreadsheet.
 * The radius remains restrained on large merged cells and becomes pill-like
 * only when a cell is naturally short.
 */
export function matrixCellBorderRadius(role: MatrixCellRole | string | undefined): number {
  if (role === "header") return 24;
  if (role === "category") return 20;
  return 18;
}

export function matrixFramePadding(density: unknown): number {
  if (density === "presentation") return 14;
  if (density === "compact") return 8;
  return 10;
}

export function matrixDivisionFramePadding(density: unknown, depth: number): number {
  const maximum = density === "presentation" ? 5 : density === "compact" ? 3 : 4;
  return Math.max(2, maximum - Math.max(0, depth - 1));
}

export const MATRIX_FRAME_RADIUS = 22;
