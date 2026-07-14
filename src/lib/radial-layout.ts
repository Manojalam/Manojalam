import type { RadialColorScheme } from "./types";

export type RadialColorSchemeDefinition = {
  id: RadialColorScheme;
  label: string;
  swatches: string[];
  hues: number[];
  saturation: number;
  lightness: number;
  rootFill: string;
  rootText: string;
  rootBorder: string;
  sectorBorder: string;
};

export const DEFAULT_RADIAL_COLOR_SCHEME: RadialColorScheme = "spectrum";

export const RADIAL_COLOR_SCHEMES: RadialColorSchemeDefinition[] = [
  {
    id: "spectrum",
    label: "Spectrum",
    swatches: ["#e11d48", "#eab308", "#10b981", "#0ea5e9", "#7c3aed"],
    hues: [348, 42, 62, 164, 198, 246, 286, 18, 122, 322, 94, 214],
    saturation: 72,
    lightness: 56,
    rootFill: "#563015",
    rootText: "#fff7ed",
    rootBorder: "#a16207",
    sectorBorder: "rgba(255,255,255,0.92)",
  },
  {
    id: "sanskrit",
    label: "Sanskrit",
    swatches: ["#881337", "#c2410c", "#ca8a04", "#0f766e", "#3730a3"],
    hues: [344, 18, 42, 174, 236, 278, 110],
    saturation: 66,
    lightness: 42,
    rootFill: "#4c1824",
    rootText: "#fff1f2",
    rootBorder: "#be7b2d",
    sectorBorder: "rgba(255,247,237,0.94)",
  },
  {
    id: "lotus",
    label: "Lotus",
    swatches: ["#9d174d", "#db2777", "#f472b6", "#f59e0b", "#7e22ce"],
    hues: [330, 345, 4, 28, 48, 286, 310],
    saturation: 70,
    lightness: 49,
    rootFill: "#651b4b",
    rootText: "#fdf2f8",
    rootBorder: "#e879b9",
    sectorBorder: "rgba(255,255,255,0.9)",
  },
  {
    id: "ocean",
    label: "Ocean",
    swatches: ["#075985", "#0284c7", "#0891b2", "#0d9488", "#2563eb"],
    hues: [198, 207, 186, 174, 221, 238],
    saturation: 68,
    lightness: 43,
    rootFill: "#0c4a6e",
    rootText: "#f0f9ff",
    rootBorder: "#38bdf8",
    sectorBorder: "rgba(240,249,255,0.92)",
  },
  {
    id: "forest",
    label: "Forest",
    swatches: ["#166534", "#15803d", "#65a30d", "#ca8a04", "#0f766e"],
    hues: [132, 151, 88, 47, 26, 174],
    saturation: 58,
    lightness: 39,
    rootFill: "#174b2d",
    rootText: "#f0fdf4",
    rootBorder: "#84cc16",
    sectorBorder: "rgba(247,254,231,0.92)",
  },
  {
    id: "scholar",
    label: "Scholar",
    swatches: ["#1e3a8a", "#b45309", "#9f1239", "#0f766e", "#6b21a8"],
    hues: [222, 38, 348, 174, 278, 202],
    saturation: 62,
    lightness: 39,
    rootFill: "#172554",
    rootText: "#eff6ff",
    rootBorder: "#d6a94b",
    sectorBorder: "rgba(248,250,252,0.9)",
  },
];

export function radialColorScheme(value: unknown): RadialColorSchemeDefinition {
  return RADIAL_COLOR_SCHEMES.find((scheme) => scheme.id === value)
    ?? RADIAL_COLOR_SCHEMES.find((scheme) => scheme.id === DEFAULT_RADIAL_COLOR_SCHEME)!;
}

export function radialSectorColors(
  scheme: RadialColorSchemeDefinition,
  branchIndex: number,
  depth: number,
  siblingIndex: number,
  siblingCount = 1,
  branchBaseColor?: string,
  fillOverride?: string
): { fill: string; fillEnd: string; text: string; border: string } {
  const automaticAnchor: HslColor = {
    h: scheme.hues[branchIndex % scheme.hues.length],
    s: scheme.saturation,
    l: scheme.lightness,
  };
  const anchor = parseColor(branchBaseColor) ?? automaticAnchor;
  const siblingOffset = depth <= 1 || siblingCount <= 1
    ? 0
    : (siblingIndex / Math.max(1, siblingCount - 1) - 0.5) * 12;
  const siblingLightness = depth <= 1 || siblingCount <= 1
    ? 0
    : (siblingIndex / Math.max(1, siblingCount - 1) - 0.5) * 4;
  const depthOffset = Math.max(0, depth - 1) * (anchor.l >= 72 ? -6 : 8);
  const derived: HslColor = {
    h: normalizeHue(anchor.h + siblingOffset),
    s: clamp(anchor.s - Math.max(0, depth - 1) * 3, 34, 86),
    l: clamp(anchor.l + depthOffset + siblingLightness, 24, 86),
  };
  const override = parseColor(fillOverride);
  const start = override ?? derived;
  const gradientDirection = start.l >= 76 ? -1 : 1;
  const end: HslColor = {
    ...start,
    l: clamp(start.l + gradientDirection * (depth <= 1 ? 4 : 7), 20, 90),
  };
  const fill = fillOverride && !override ? fillOverride : hslString(start);
  const fillEnd = fillOverride && !override ? fillOverride : hslString(end);
  const borderLightness = clamp(Math.min(start.l, end.l) - 18, 18, 68);
  return {
    fill,
    fillEnd,
    text: readableTextColor(start, end),
    border: `hsla(${start.h.toFixed(1)}, ${Math.max(30, start.s - 10).toFixed(1)}%, ${borderLightness.toFixed(1)}%, 0.62)`,
  };
}

type HslColor = { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function hslString(color: HslColor): string {
  return `hsl(${color.h.toFixed(1)}, ${color.s.toFixed(1)}%, ${color.l.toFixed(1)}%)`;
}

function parseColor(value: string | undefined): HslColor | null {
  if (!value) return null;
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const expanded = hex[1].length === 3
      ? hex[1].split("").map((character) => `${character}${character}`).join("")
      : hex[1];
    const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
    const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
    const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    let hue = 0;
    if (delta) {
      if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
    }
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    return { h: normalizeHue(hue), s: saturation * 100, l: lightness * 100 };
  }

  const hsl = value.trim().match(/^hsla?\(\s*(-?[\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/i);
  if (!hsl) return null;
  return {
    h: normalizeHue(Number(hsl[1])),
    s: clamp(Number(hsl[2]), 0, 100),
    l: clamp(Number(hsl[3]), 0, 100),
  };
}

function hslToRgb(color: HslColor): [number, number, number] {
  const saturation = color.s / 100;
  const lightness = color.l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = normalizeHue(color.h) / 60;
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
  const [red, green, blue] = hue < 1 ? [chroma, secondary, 0]
    : hue < 2 ? [secondary, chroma, 0]
      : hue < 3 ? [0, chroma, secondary]
        : hue < 4 ? [0, secondary, chroma]
          : hue < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return [red + match, green + match, blue + match];
}

function relativeLuminance(color: HslColor): number {
  const channels = hslToRgb(color).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableTextColor(start: HslColor, end: HslColor): string {
  const background = (relativeLuminance(start) + relativeLuminance(end)) / 2;
  const dark = 0.008;
  const light = 0.955;
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? "#0f172a" : "#f8fafc";
}
