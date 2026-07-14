export const MIN_VISIBLE_GRID_GAP = 12;
export const MAX_VISIBLE_GRID_GAP = 56;

/**
 * Keep the stored logical grid spacing unchanged. Only render every 2nd/4th/8th
 * line when zoomed out so the background remains readable and snap stays exact.
 */
export function adaptiveGridMultiplier(logicalGap: number, zoom: number): number {
  const safeGap = Number.isFinite(logicalGap) && logicalGap > 0 ? logicalGap : 32;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  let multiplier = 1;
  while (safeGap * multiplier * safeZoom < MIN_VISIBLE_GRID_GAP) multiplier *= 2;
  while (multiplier > 1 && safeGap * (multiplier / 2) * safeZoom >= MIN_VISIBLE_GRID_GAP) multiplier /= 2;
  return multiplier;
}

export function renderedGridGap(logicalGap: number, zoom: number): number {
  const safeGap = Number.isFinite(logicalGap) && logicalGap > 0 ? logicalGap : 32;
  return safeGap * adaptiveGridMultiplier(safeGap, zoom);
}
