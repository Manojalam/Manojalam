export type MatrixCellRole = "header" | "category" | "cell";

export const MATRIX_GRID_STROKE_WIDTH = 1;
export const MAX_MATRIX_GRID_STROKE_WIDTH = 6;
export const MATRIX_GRID_RADIUS = 4;

export function matrixGridStrokeWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return MATRIX_GRID_STROKE_WIDTH;
  }
  return Math.max(0.5, Math.min(MAX_MATRIX_GRID_STROKE_WIDTH, value));
}

/**
 * Matrix keeps authored node shapes visually independent from its flat table
 * grid. Table-sized corners stay legible even after a large Matrix is fitted
 * into the viewport; pill-sized corners make adjacent compact rows look as if
 * they overlap.
 */
export function matrixCellBorderRadius(role: MatrixCellRole | string | undefined): number {
  if (role === "header") return 8;
  if (role === "category") return 6;
  return 4;
}

/** Expand a division to the midpoint of the standard gap between Matrix cells. */
export function matrixCellDivisionPadding(density: unknown): number {
  if (density === "presentation") return 6;
  if (density === "compact") return 3;
  return 4;
}
