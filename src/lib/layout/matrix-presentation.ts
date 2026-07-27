export type MatrixCellRole = "header" | "category" | "cell";

export const MATRIX_DIVISION_FRAME_BORDER_WIDTH = 1.5;
export const MATRIX_DIVISION_FRAME_RADIUS = 8;

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

/** Expand a division to the midpoint of the standard gap between Matrix cells. */
export function matrixCellDivisionPadding(density: unknown): number {
  if (density === "presentation") return 6;
  if (density === "compact") return 3;
  return 4;
}

export const MATRIX_FRAME_RADIUS = 22;
