import type { RadialColorScheme } from "@/lib/types";

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
  siblingCount = 1
): { fill: string; text: string; border: string } {
  // Keep a branch on one recognizable hue and encode hierarchy primarily by
  // depth. Descendant siblings fan out within a bounded hue window.
  const siblingOffset = depth <= 1 || siblingCount <= 1
    ? 0
    : (siblingIndex / Math.max(1, siblingCount - 1) - 0.5) * 24;
  const hue = (scheme.hues[branchIndex % scheme.hues.length] + siblingOffset + 360) % 360;
  const depthOffset = Math.max(0, depth - 1) * 9;
  const siblingLightness = depth <= 1 ? 0 : siblingIndex % 2 ? 2.5 : -2.5;
  const saturation = Math.max(42, scheme.saturation - Math.max(0, depth - 1) * 3);
  const lightness = Math.min(80, scheme.lightness + depthOffset + siblingLightness);
  const borderLightness = Math.max(22, lightness - 24);
  return {
    fill: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    text: lightness < 56 ? "#f8fafc" : "#111827",
    border: `hsla(${hue}, ${Math.max(34, saturation - 8)}%, ${borderLightness}%, 0.58)`,
  };
}
