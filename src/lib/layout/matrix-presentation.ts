export type MatrixCellRole = "header" | "category" | "cell";

export const MATRIX_GRID_STROKE_WIDTH = 1;
export const MATRIX_GRID_RADIUS = 4;

/**
 * Matrix keeps authored node shapes visually independent from its flat table
 * grid. Large merged labels stay restrained while short labels can be pill-like.
 */
export function matrixCellBorderRadius(role: MatrixCellRole | string | undefined): number {
  if (role === "header") return 24;
  if (role === "category") return 20;
  return 18;
}

/** Expand a division to the midpoint of the standard gap between Matrix cells. */
export function matrixCellDivisionPadding(density: unknown): number {
  if (density === "presentation") return 6;
  if (density === "compact") return 3;
  return 4;
}
