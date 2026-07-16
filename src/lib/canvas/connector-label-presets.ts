export const DEFAULT_CONNECTOR_LABEL_PRESETS = ["Yes", "No"] as const;
export const MAX_CONNECTOR_LABEL_PRESETS = 12;
export const MAX_CONNECTOR_LABEL_PRESET_LENGTH = 40;

/** Keeps board-level connector shortcuts compact, unique, and Unicode-safe. */
export function normalizeConnectorLabelPresets(
  value: unknown,
  fallback: readonly string[] = DEFAULT_CONNECTOR_LABEL_PRESETS
): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const candidate of source) {
    if (typeof candidate !== "string") continue;
    const label = candidate.trim().normalize("NFC").slice(0, MAX_CONNECTOR_LABEL_PRESET_LENGTH);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    normalized.push(label);
    if (normalized.length >= MAX_CONNECTOR_LABEL_PRESETS) break;
  }

  return normalized;
}
