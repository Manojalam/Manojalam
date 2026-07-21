import type { CSSProperties } from "react";

export const TEXT_ROTATION_MIN = -180;
export const TEXT_ROTATION_MAX = 180;

/** Keep user-authored text rotation in the same signed range as object rotation. */
export function normalizeTextRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value >= TEXT_ROTATION_MIN && value <= TEXT_ROTATION_MAX) {
    return Object.is(value, -0) ? 0 : value;
  }
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && value > 0) return 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function textRotationStyle(value: unknown): CSSProperties {
  const rotation = normalizeTextRotation(value);
  return rotation
    ? { transform: `rotate(${rotation}deg)`, transformOrigin: "center center" }
    : {};
}
