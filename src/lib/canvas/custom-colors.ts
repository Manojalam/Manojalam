const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_COLOR_INPUT_VALUE = "#000000";

export const MAX_CUSTOM_COLORS = 18;

/** Return a valid value for an HTML color input without letting the browser reset it to black. */
export function colorInputValue(value: unknown, fallback = DEFAULT_COLOR_INPUT_VALUE): string {
  if (typeof value === "string" && HEX_COLOR_PATTERN.test(value)) return value.toLowerCase();
  return HEX_COLOR_PATTERN.test(fallback) ? fallback.toLowerCase() : DEFAULT_COLOR_INPUT_VALUE;
}

/** Combine the recent-color lists used by older and newer palette contexts. */
export function mergeCustomColors(...values: unknown[]): string[] {
  return normalizeCustomColors(values.flatMap((value) => Array.isArray(value) ? value : []));
}

export function normalizeCustomColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const colors: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !HEX_COLOR_PATTERN.test(candidate)) continue;
    const normalized = candidate.toLowerCase();
    if (!colors.includes(normalized)) colors.push(normalized);
  }
  return colors.slice(-MAX_CUSTOM_COLORS);
}

export function rememberCustomColor(value: unknown, color: string): string[] {
  const normalized = color.toLowerCase();
  if (!HEX_COLOR_PATTERN.test(normalized)) return normalizeCustomColors(value);
  return [
    ...normalizeCustomColors(value).filter((candidate) => candidate !== normalized),
    normalized,
  ].slice(-MAX_CUSTOM_COLORS);
}
