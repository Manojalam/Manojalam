export const MIN_RADIAL_LABEL_ROTATION = -180;
export const MAX_RADIAL_LABEL_ROTATION = 180;

/** Keep an authored relative label angle in the inspector's stable range. */
export function normalizeRadialLabelRotation(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  let normalized = ((numeric + 180) % 360 + 360) % 360 - 180;
  // Preserve the positive endpoint for explicit +180 inputs.
  if (normalized === -180 && numeric > 0) normalized = 180;
  return Math.round(normalized * 1000) / 1000;
}

/** Manual rotation is an offset so labels keep following their sector geometry. */
export function resolveRadialLabelRotation(
  automaticRotation: number,
  manualRotation: unknown
): number {
  return automaticRotation + normalizeRadialLabelRotation(manualRotation);
}

function uprightWorldRotation(baseWorldRotation: number): number {
  const normalized = ((baseWorldRotation % 360) + 360) % 360;
  return normalized > 90 && normalized < 270
    ? baseWorldRotation + 180
    : baseWorldRotation;
}

/**
 * Resolve the SVG-local angle for a sector label. Readability is decided in
 * screen space after whole-chart rotation, then converted back to local space.
 */
export function resolveChartAwareSectorLabelRotation(
  baseLocalRotation: number,
  chartRotation: unknown,
  manualRotation: unknown
): number {
  const chart = normalizeRadialLabelRotation(chartRotation);
  const uprightWorld = uprightWorldRotation(baseLocalRotation + chart);
  return normalizeRadialLabelRotation(
    uprightWorld - chart + normalizeRadialLabelRotation(manualRotation)
  );
}

/** Keep the center label screen-upright while retaining its manual angle. */
export function resolveChartAwareCenterLabelRotation(
  chartRotation: unknown,
  manualRotation: unknown
): number {
  return normalizeRadialLabelRotation(
    normalizeRadialLabelRotation(manualRotation)
      - normalizeRadialLabelRotation(chartRotation)
  );
}
