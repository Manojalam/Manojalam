import type { CSSProperties } from "react";

const LEGACY_ROTATION_NODE_TYPES = new Set([
  "mindmap",
  "relationshipDiagram",
  "shape",
  "sunburst",
]);

export const OBJECT_ROTATION_MIN = -180;
export const OBJECT_ROTATION_MAX = 180;

export function normalizeObjectRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value >= OBJECT_ROTATION_MIN && value <= OBJECT_ROTATION_MAX) {
    return Object.is(value, -0) ? 0 : value;
  }
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && value > 0) return 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function supportsObjectRotation(
  nodeType: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!nodeType || nodeType === "junction") return false;
  if (data?.matrixCell === true || typeof data?.matrixFrameFor === "string") return false;
  return true;
}

export function resolveObjectRotation(
  nodeType: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): number {
  if (!supportsObjectRotation(nodeType, data)) return 0;
  if (typeof data?.objectRotation === "number") {
    return normalizeObjectRotation(data.objectRotation);
  }
  if (nodeType && LEGACY_ROTATION_NODE_TYPES.has(nodeType) && typeof data?.rotation === "number") {
    return normalizeObjectRotation(data.rotation);
  }
  return 0;
}

export function objectRotationStyle(
  nodeType: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): CSSProperties {
  const rotation = resolveObjectRotation(nodeType, data);
  return rotation
    ? { transform: `rotate(${rotation}deg)`, transformOrigin: "center" }
    : {};
}
