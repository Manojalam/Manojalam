import type { Viewport } from "@xyflow/react";

export interface HydratedSunburstGeometryInput {
  position: { x: number; y: number };
  currentSize: { width: number; height: number };
  chartSize: unknown;
  automaticSize: number;
  legacyVisualBounds?: Partial<{ minX: number; minY: number }> | null;
}

export interface HydratedSunburstGeometry {
  position: { x: number; y: number };
  size: number;
  migratedLegacyBounds: boolean;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positive(value: unknown, fallback: number): number {
  const resolved = finite(value, fallback);
  return resolved > 0 ? resolved : fallback;
}

/** Persisted chart geometry wins during hydration; automatic sizing is for a new layout. */
export function resolveHydratedSunburstGeometry(
  input: HydratedSunburstGeometryInput
): HydratedSunburstGeometry {
  const fallbackSize = positive(
    Math.min(input.currentSize.width, input.currentSize.height),
    positive(input.automaticSize, 900)
  );
  const size = positive(input.chartSize, fallbackSize);
  const position = {
    x: finite(input.position.x, 0),
    y: finite(input.position.y, 0),
  };
  const bounds = input.legacyVisualBounds;
  if (!bounds) return { position, size, migratedLegacyBounds: false };

  const minX = finite(bounds.minX, 0);
  const minY = finite(bounds.minY, 0);
  const previousSize = positive(input.chartSize, fallbackSize);
  return {
    position: {
      x: position.x - minX - (size - previousSize) / 2,
      y: position.y - minY - (size - previousSize) / 2,
    },
    size,
    migratedLegacyBounds: true,
  };
}

export function viewportsEqual(first: Viewport, second: Viewport, epsilon = 0.001): boolean {
  return Math.abs(first.x - second.x) <= epsilon
    && Math.abs(first.y - second.y) <= epsilon
    && Math.abs(first.zoom - second.zoom) <= epsilon;
}
