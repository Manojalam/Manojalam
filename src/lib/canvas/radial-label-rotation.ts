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
