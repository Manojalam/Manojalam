import type { Edge } from "@xyflow/react";
import type { ConnectorLabelPreset } from "../types";
import {
  applyConnectorLabelStyleUpdate,
  type ConnectorLabelStyleUpdate,
} from "./connector-label-style";

export const DEFAULT_CONNECTOR_LABEL_PRESETS: readonly ConnectorLabelPreset[] = [
  { label: "Yes", color: "#22c55e", syncConnectorColor: true },
  { label: "No", color: "#ef4444", syncConnectorColor: true },
];
export const MAX_CONNECTOR_LABEL_PRESETS = 12;
export const MAX_CONNECTOR_LABEL_PRESET_LENGTH = 40;

function normalizePresetColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : undefined;
}

/** Keeps board-level connector shortcuts compact, styled, unique, and Unicode-safe. */
export function normalizeConnectorLabelPresets(
  value: unknown,
  fallback: readonly unknown[] = DEFAULT_CONNECTOR_LABEL_PRESETS
): ConnectorLabelPreset[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized: ConnectorLabelPreset[] = [];
  const seen = new Set<string>();

  for (const candidate of source) {
    const rawLabel = typeof candidate === "string"
      ? candidate
      : candidate && typeof candidate === "object" && "label" in candidate
        ? (candidate as { label?: unknown }).label
        : undefined;
    if (typeof rawLabel !== "string") continue;
    const label = rawLabel.trim().normalize("NFC").slice(0, MAX_CONNECTOR_LABEL_PRESET_LENGTH);
    if (!label || seen.has(label)) continue;
    seen.add(label);

    const color = typeof candidate === "object" && candidate
      ? normalizePresetColor((candidate as { color?: unknown }).color)
      : undefined;
    normalized.push(color
      ? {
          label,
          color,
          syncConnectorColor: (candidate as { syncConnectorColor?: unknown }).syncConnectorColor === true,
        }
      : { label });
    if (normalized.length >= MAX_CONNECTOR_LABEL_PRESETS) break;
  }

  return normalized;
}

/** Converts a reusable shortcut into an explicit per-connector style update. */
export function connectorLabelPresetUpdate(
  preset: ConnectorLabelPreset
): ConnectorLabelStyleUpdate {
  if (!preset.color) return { label: preset.label };
  return {
    label: preset.label,
    labelColor: preset.color,
    labelColorSynced: preset.syncConnectorColor === true,
  };
}

/** Applies a shortcut without retaining a live link, so the connector can be overridden later. */
export function applyConnectorLabelPreset(
  edges: Edge[],
  connectorEdgeId: string,
  preset: ConnectorLabelPreset
): Edge[] {
  return applyConnectorLabelStyleUpdate(
    edges,
    connectorEdgeId,
    connectorLabelPresetUpdate(preset)
  );
}
