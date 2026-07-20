const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const MAX_CUSTOM_COLORS = 18;

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
