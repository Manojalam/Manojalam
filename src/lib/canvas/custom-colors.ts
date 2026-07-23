const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_COLOR_INPUT_VALUE = "#000000";

export const MAX_CUSTOM_COLORS = 18;

/** General-purpose swatches: saturated defaults first, then light tints and neutrals. */
export const COLOR_SWATCH_GROUPS = [
  {
    name: "Bright",
    colors: [
      "#ff3b30", "#ff7a00", "#f5c400", "#a3d900", "#16b364",
      "#00a88f", "#00a8e8", "#2878ff", "#6f5cff", "#e83e8c",
    ],
  },
  {
    name: "Light",
    colors: [
      "#ffd8d6", "#ffe3c2", "#fff1a8", "#e8f7b2", "#c9f3d8",
      "#bff2e8", "#c8efff", "#d6e4ff", "#e3ddff", "#ffd6e8",
    ],
  },
  {
    name: "Strong",
    colors: [
      "#d92d20", "#dc6803", "#ca8504", "#65a30d", "#087f5b",
      "#0f766e", "#0369a1", "#155eef", "#5925dc", "#c11574",
    ],
  },
  {
    name: "Neutral",
    colors: [
      "#ffffff", "#f8fafc", "#e2e8f0", "#cbd5e1", "#94a3b8",
      "#64748b", "#475569", "#334155", "#1e293b", "#0f172a",
    ],
  },
] as const;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToRgb(value: unknown): RgbColor | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: maximum === 0 ? 0 : (delta / maximum) * 100,
    v: maximum * 100,
  };
}

export function hexToHsv(value: unknown): HsvColor | null {
  const rgb = hexToRgb(value);
  return rgb ? rgbToHsv(rgb) : null;
}

function isPaletteNeutral({ s, v }: HsvColor): boolean {
  return s < 12 || v < 18;
}

/**
 * Arrange a mixed palette into a predictable visual sequence:
 * light-to-dark neutrals, then colors around the hue wheel from red to pink.
 */
export function arrangeColorPalette(values: readonly string[]): string[] {
  const colors: Array<{
    color: string;
    hsv: HsvColor | null;
    index: number;
  }> = [];
  const seen = new Set<string>();

  values.forEach((value, index) => {
    const color = normalizeHexColor(value) ?? value.trim();
    const identity = color.toLowerCase();
    if (!color || seen.has(identity)) return;
    seen.add(identity);
    colors.push({ color, hsv: hexToHsv(color), index });
  });

  return colors
    .sort((left, right) => {
      if (!left.hsv || !right.hsv) {
        if (!left.hsv && !right.hsv) return left.index - right.index;
        return left.hsv ? -1 : 1;
      }

      const leftNeutral = isPaletteNeutral(left.hsv);
      const rightNeutral = isPaletteNeutral(right.hsv);
      if (leftNeutral !== rightNeutral) return leftNeutral ? -1 : 1;
      if (leftNeutral && rightNeutral) {
        return right.hsv.v - left.hsv.v || left.index - right.index;
      }

      // Rotate the hue wheel by 15° so reds straddling 0° remain together.
      const leftHue = (left.hsv.h + 15) % 360;
      const rightHue = (right.hsv.h + 15) % 360;
      return leftHue - rightHue
        || right.hsv.v - left.hsv.v
        || right.hsv.s - left.hsv.s
        || left.index - right.index;
    })
    .map(({ color }) => color);
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const brightness = clamp(v, 0, 100) / 100;
  const chroma = brightness * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = brightness - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, second];
  else if (segment < 2) [red, green] = [second, chroma];
  else if (segment < 3) [green, blue] = [chroma, second];
  else if (segment < 4) [green, blue] = [second, chroma];
  else if (segment < 5) [red, blue] = [second, chroma];
  else [red, blue] = [chroma, second];

  return rgbToHex({
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255,
  });
}

/** Accept a six-digit hex value with or without its leading hash. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX_COLOR_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

/** Compare picker values without letting casing or an omitted leading hash hide the selection marker. */
export function colorSwatchMatches(value: unknown, swatch: unknown, mixed = false): boolean {
  if (mixed || typeof value !== "string" || typeof swatch !== "string") return false;
  const normalizedValue = normalizeHexColor(value);
  const normalizedSwatch = normalizeHexColor(swatch);
  if (normalizedValue && normalizedSwatch) return normalizedValue === normalizedSwatch;
  return value.trim().toLowerCase() === swatch.trim().toLowerCase();
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
