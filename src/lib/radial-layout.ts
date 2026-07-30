import type { MatrixRowColorPattern, RadialColorScheme } from "./types";

export type RadialColorSchemeDefinition = {
  id: RadialColorScheme;
  label: string;
  swatches: string[];
  hues: number[];
  /**
   * Unwrapped hue endpoints for a smooth top-to-bottom Matrix row sequence.
   * Values may sit outside 0-360 to preserve the intended travel direction.
   */
  matrixHueRange: readonly [number, number];
  saturation: number;
  lightness: number;
  rootFill: string;
  rootText: string;
  rootBorder: string;
  sectorBorder: string;
};

export const DEFAULT_RADIAL_COLOR_SCHEME: RadialColorScheme = "spectrum";
export const DEFAULT_MATRIX_ROW_COLOR_PATTERN: MatrixRowColorPattern = "flow";

/**
 * Resolves the angular weight of a hierarchy sector.
 *
 * Equal-outermost mode deliberately ignores authored weights so every terminal
 * sector contributes exactly one unit. A parent still occupies the combined
 * weight of all terminal sectors below it.
 */
export function radialHierarchyWeight(
  childWeights: readonly number[],
  manualWeight: unknown,
  equalOutermostSegments = false
): number {
  const automaticWeight = childWeights.length
    ? childWeights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
    : 1;
  if (equalOutermostSegments) return Math.max(0.01, automaticWeight);

  const parsedManualWeight = typeof manualWeight === "string"
    ? Number.parseFloat(manualWeight)
    : manualWeight;
  const numericManualWeight = typeof parsedManualWeight === "number" && Number.isFinite(parsedManualWeight)
    ? parsedManualWeight
    : 1;
  return Math.max(0.01, automaticWeight * clamp(numericManualWeight, 0.1, 10));
}

/**
 * Chooses one font size for terminal radial labels after each label has been
 * fitted to its own sector. A missing fit lowers the group to the readable
 * floor instead of allowing the remaining labels to look inconsistently large.
 */
export function radialOutermostCommonFontSize(
  fittedFontSizes: readonly (number | null)[],
  preferredFontSize: number,
  minimumReadableFontSize: number
): number | null {
  if (!fittedFontSizes.length) return null;
  const minimum = clamp(minimumReadableFontSize, 4, 96);
  const preferred = clamp(preferredFontSize, minimum, 96);
  const tightestFit = fittedFontSizes.reduce<number>((smallest, fitted) => {
    const size = typeof fitted === "number" && Number.isFinite(fitted)
      ? clamp(fitted, minimum, preferred)
      : minimum;
    return Math.min(smallest, size);
  }, preferred);
  return clamp(tightestFit, minimum, preferred);
}

export const RADIAL_COLOR_SCHEMES: RadialColorSchemeDefinition[] = [
  {
    id: "spectrum",
    label: "Spectrum",
    swatches: ["#bf4059", "#bf9940", "#40bf9d", "#4088bf", "#a140bf"],
    hues: [348, 42, 62, 164, 198, 246, 286, 18, 122, 322, 94, 214],
    matrixHueRange: [348, 682],
    saturation: 50,
    lightness: 50,
    rootFill: "#29344f",
    rootText: "#ffffff",
    rootBorder: "#667085",
    sectorBorder: "rgba(248,250,252,0.82)",
  },
  {
    id: "sanskrit",
    label: "Sanskrit",
    swatches: ["#aa3c59", "#aa5d3c", "#aa893c", "#3caa9f", "#3c43aa"],
    hues: [344, 18, 42, 174, 236, 278, 110],
    matrixHueRange: [344, 638],
    saturation: 48,
    lightness: 45,
    rootFill: "#4b2632",
    rootText: "#fffaf2",
    rootBorder: "#9a7652",
    sectorBorder: "rgba(255,250,242,0.84)",
  },
  {
    id: "lotus",
    label: "Lotus",
    swatches: ["#b83d7a", "#b83d5c", "#b83da3", "#b8773d", "#9a3db8"],
    hues: [330, 345, 4, 28, 48, 286, 310],
    matrixHueRange: [330, 408],
    saturation: 50,
    lightness: 48,
    rootFill: "#51243f",
    rootText: "#fff7fb",
    rootBorder: "#95647f",
    sectorBorder: "rgba(255,247,251,0.82)",
  },
  {
    id: "ocean",
    label: "Ocean",
    swatches: ["#4289a9", "#4279a9", "#429da9", "#42a99e", "#4263a9"],
    hues: [198, 207, 186, 174, 221, 238],
    matrixHueRange: [174, 238],
    saturation: 44,
    lightness: 46,
    rootFill: "#243f56",
    rootText: "#f4faff",
    rootBorder: "#55758c",
    sectorBorder: "rgba(244,250,255,0.84)",
  },
  {
    id: "forest",
    label: "Forest",
    swatches: ["#42944f", "#429467", "#6b9442", "#948242", "#42948b"],
    hues: [132, 151, 88, 47, 26, 174],
    matrixHueRange: [26, 174],
    saturation: 38,
    lightness: 42,
    rootFill: "#263f32",
    rootText: "#f7fbf7",
    rootBorder: "#617a69",
    sectorBorder: "rgba(247,251,247,0.84)",
  },
  {
    id: "scholar",
    label: "Scholar",
    swatches: ["#415b9f", "#9f7d41", "#9f4154", "#419f96", "#7d419f"],
    hues: [222, 38, 348, 174, 278, 202],
    matrixHueRange: [38, -186],
    saturation: 42,
    lightness: 44,
    rootFill: "#2c334f",
    rootText: "#f8f7f3",
    rootBorder: "#80745f",
    sectorBorder: "rgba(248,247,243,0.82)",
  },
];

export function radialColorScheme(value: unknown): RadialColorSchemeDefinition {
  return RADIAL_COLOR_SCHEMES.find((scheme) => scheme.id === value)
    ?? RADIAL_COLOR_SCHEMES.find((scheme) => scheme.id === DEFAULT_RADIAL_COLOR_SCHEME)!;
}

const MAX_MATRIX_ROW_HUE_STEP = 32;
const GENTLE_MATRIX_HUE_SPAN = 56;
const MATRIX_ROW_LIGHTNESS = 64;

export function matrixRowColorPattern(value: unknown): MatrixRowColorPattern {
  if (
    value === "gentle"
    || value === "duotone"
    || value === "alternating"
    || value === "curated"
  ) {
    return value;
  }
  return DEFAULT_MATRIX_ROW_COLOR_PATTERN;
}

function shortestHueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function matrixSecondaryAnchor(
  scheme: RadialColorSchemeDefinition,
  endColor?: string
): HslColor {
  const paletteHue = scheme.hues[Math.floor(scheme.hues.length / 2)]
    ?? normalizeHue(scheme.matrixHueRange[1]);
  return parseColor(endColor) ?? {
    h: paletteHue,
    s: scheme.saturation,
    l: MATRIX_ROW_LIGHTNESS,
  };
}

/**
 * Returns one coordinated anchor for a Matrix row.
 *
 * Flow patterns sample the row count across a continuous hue path, while
 * discrete patterns alternate or repeat coordinated palette anchors. Every
 * pattern keeps one shared lightness so the independent column fade remains
 * predictable.
 */
export function matrixRowAnchorColor(
  scheme: RadialColorSchemeDefinition,
  branchIndex: number,
  branchCount: number,
  startColor?: string,
  pattern: MatrixRowColorPattern = DEFAULT_MATRIX_ROW_COLOR_PATTERN,
  endColor?: string
): string {
  const count = Math.max(1, Math.floor(branchCount));
  const index = clamp(Math.floor(branchIndex), 0, count - 1);
  const [defaultStartHue, requestedEndHue] = scheme.matrixHueRange;
  const customAnchor = parseColor(startColor);
  const startHue = customAnchor?.h ?? defaultStartHue;
  const startSaturation = customAnchor ? Math.min(customAnchor.s, 58) : scheme.saturation;
  const progress = count <= 1 ? 0 : index / (count - 1);

  if (pattern === "duotone" || pattern === "alternating") {
    const startAnchor: HslColor = {
      h: startHue,
      s: startSaturation,
      l: MATRIX_ROW_LIGHTNESS,
    };
    const endAnchor = matrixSecondaryAnchor(scheme, endColor);
    const mix = pattern === "alternating" ? index % 2 : progress;
    return hslString({
      h: startAnchor.h + shortestHueDelta(startAnchor.h, endAnchor.h) * mix,
      s: clamp(
        startAnchor.s + (Math.min(endAnchor.s, 58) - startAnchor.s) * mix,
        0,
        58
      ),
      l: MATRIX_ROW_LIGHTNESS,
    });
  }

  if (pattern === "curated") {
    const paletteStartHue = scheme.hues[0] ?? defaultStartHue;
    const rotation = customAnchor ? customAnchor.h - paletteStartHue : 0;
    const paletteHue = scheme.hues[index % scheme.hues.length] ?? defaultStartHue;
    return hslString({
      h: paletteHue + rotation,
      s: startSaturation,
      l: MATRIX_ROW_LIGHTNESS,
    });
  }

  const requestedSpan = requestedEndHue - defaultStartHue;
  const maximumSpan = MAX_MATRIX_ROW_HUE_STEP * Math.max(0, count - 1);
  const patternSpan = pattern === "gentle"
    ? Math.min(Math.abs(requestedSpan), GENTLE_MATRIX_HUE_SPAN)
    : Math.abs(requestedSpan);
  const span = Math.sign(requestedSpan) * Math.min(patternSpan, maximumSpan);
  return hslString({
    h: startHue + span * progress,
    s: startSaturation,
    // Matrix flow uses the chosen hue and moderated chroma, but one shared
    // lightness keeps row progression and dark label contrast predictable.
    l: MATRIX_ROW_LIGHTNESS,
  });
}

/** Dark chart-root treatment summarizing the complete automatic row flow. */
export function matrixRootPaletteGradient(
  scheme: RadialColorSchemeDefinition,
  branchCount: number,
  startColor?: string,
  pattern: MatrixRowColorPattern = DEFAULT_MATRIX_ROW_COLOR_PATTERN,
  endColor?: string
): string {
  const count = Math.max(1, Math.floor(branchCount));
  const stopCount = Math.min(7, Math.max(2, count));
  const stops = Array.from({ length: stopCount }, (_, stopIndex) => {
    const progress = stopCount <= 1 ? 0 : stopIndex / (stopCount - 1);
    const branchIndex = count <= 1 ? 0 : Math.round(progress * (count - 1));
    const anchor = parseColor(
      matrixRowAnchorColor(scheme, branchIndex, count, startColor, pattern, endColor)
    )!;
    const darkAnchor = hslString({
      h: anchor.h,
      s: Math.min(anchor.s, 52),
      l: 30 + (stopIndex % 2 === 0 ? 0 : 2),
    });
    return `${darkAnchor} ${(progress * 100).toFixed(1)}%`;
  });
  return `linear-gradient(100deg, ${stops.join(", ")})`;
}

export function radialSectorColors(
  scheme: RadialColorSchemeDefinition,
  branchIndex: number,
  depth: number,
  siblingIndex: number,
  siblingCount = 1,
  branchBaseColor?: string,
  fillOverride?: string,
  preferLighterDepth = false
): { fill: string; fillEnd: string; text: string; border: string } {
  const automaticAnchor: HslColor = {
    h: scheme.hues[branchIndex % scheme.hues.length],
    s: scheme.saturation,
    l: scheme.lightness,
  };
  const anchor = parseColor(branchBaseColor) ?? automaticAnchor;
  const siblingOffset = depth <= 1 || siblingCount <= 1
    ? 0
    : (siblingIndex / Math.max(1, siblingCount - 1) - 0.5) * 8;
  const siblingLightness = depth <= 1 || siblingCount <= 1
    ? 0
    : (siblingIndex / Math.max(1, siblingCount - 1) - 0.5) * 2;
  const depthOffset = Math.max(0, depth - 1) * (preferLighterDepth ? 4 : anchor.l >= 72 ? -4 : 4);
  const saturationFloor = anchor.s < 12 ? 0 : 28;
  const derived: HslColor = {
    h: normalizeHue(anchor.h + siblingOffset),
    s: clamp(anchor.s - Math.max(0, depth - 1) * 4, saturationFloor, 68),
    l: clamp(anchor.l + depthOffset + siblingLightness, 26, preferLighterDepth ? 100 : 78),
  };
  const override = parseColor(fillOverride);
  const start = override ?? derived;
  const text = readableTextColor(start);
  const gradientDirection = text === "#ffffff" ? -1 : 1;
  const end: HslColor = {
    ...start,
    l: clamp(start.l + gradientDirection * (depth <= 1 ? 3 : 4), 20, 90),
  };
  const fill = fillOverride && !override ? fillOverride : hslString(start);
  const fillEnd = fillOverride && !override ? fillOverride : hslString(end);
  const borderLightness = clamp(Math.min(start.l, end.l) - 18, 18, 68);
  return {
    fill,
    fillEnd,
    text,
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
  return `hsl(${normalizeHue(color.h).toFixed(1)}, ${color.s.toFixed(1)}%, ${color.l.toFixed(1)}%)`;
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

function readableTextColor(background: HslColor): string {
  const backgroundLuminance = relativeLuminance(background);
  const dark = relativeLuminance(parseColor("#020617")!);
  const light = relativeLuminance(parseColor("#ffffff")!);
  return contrastRatio(backgroundLuminance, dark) >= contrastRatio(backgroundLuminance, light)
    ? "#020617"
    : "#ffffff";
}
