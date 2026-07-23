const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_COLOR_INPUT_VALUE = "#000000";

export const MAX_CUSTOM_COLORS = 18;

/** Saturated colors intended for diagrams, posters, and high-contrast charts. */
export const VIVID_CHART_COLORS = [
  { name: "Coral red", value: "#f0443e" },
  { name: "Vermilion", value: "#e54825" },
  { name: "Vivid orange", value: "#dc6425" },
  { name: "Golden yellow", value: "#f5b700" },
  { name: "Leaf green", value: "#17a052" },
  { name: "Emerald", value: "#008f5a" },
  { name: "Bright teal", value: "#009688" },
  { name: "Ocean blue", value: "#177da6" },
  { name: "Royal blue", value: "#2563eb" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Chart magenta", value: "#bb2f6c" },
  { name: "Hot pink", value: "#db2777" },
  { name: "Fuchsia", value: "#c026d3" },
  { name: "Deep red", value: "#b91c1c" },
  { name: "Burnt orange", value: "#c2410c" },
  { name: "Deep green", value: "#087f45" },
  { name: "Deep teal", value: "#0f766e" },
  { name: "Deep blue", value: "#1554ad" },
  { name: "Deep magenta", value: "#9d174d" },
] as const;

/** Accept a six-digit hex value with or without its leading hash. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX_COLOR_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

/** Return a valid value for an HTML color input without letting the browser reset it to black. */
export function colorInputValue(value: unknown, fallback = DEFAULT_COLOR_INPUT_VALUE): string {
  return normalizeHexColor(value)
    ?? normalizeHexColor(fallback)
    ?? DEFAULT_COLOR_INPUT_VALUE;
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
