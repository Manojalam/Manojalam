import type { SurfaceEffectPreset } from "../types";

export interface SurfaceEffectSettings {
  preset: SurfaceEffectPreset;
  depth: number;
  strength: number;
  angle: number;
}

export interface SurfaceEffectStyle {
  backgroundImage?: string;
  backgroundBlendMode?: string;
  backdropFilter?: string;
  boxShadow?: string;
}

export interface SurfaceEffectShadowLayer {
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export const SURFACE_EFFECT_PRESETS: ReadonlyArray<{
  id: SurfaceEffectPreset;
  label: string;
  description: string;
  depth: number;
  strength: number;
  angle: number;
}> = [
  { id: "flat", label: "Flat", description: "Clean, print-like surface", depth: 0, strength: 0, angle: 45 },
  { id: "soft", label: "Soft", description: "Gentle floating shadow", depth: 7, strength: 34, angle: 45 },
  { id: "raised", label: "Raised", description: "Layered card with directional depth", depth: 10, strength: 56, angle: 45 },
  { id: "bevel", label: "Bevel", description: "Sculpted inner highlight and edge", depth: 6, strength: 62, angle: 45 },
  { id: "glass", label: "Glass", description: "Glossy highlight with soft depth", depth: 8, strength: 44, angle: 45 },
  { id: "metallic", label: "Metal", description: "Polished directional bands with a specular edge", depth: 6, strength: 72, angle: 20 },
  { id: "glow", label: "Glow", description: "Colored halo around the surface", depth: 12, strength: 58, angle: 45 },
] as const;

const PRESET_BY_ID = new Map(SURFACE_EFFECT_PRESETS.map((preset) => [preset.id, preset]));

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeSurfaceEffect(data: Record<string, unknown>): SurfaceEffectSettings {
  const requestedPreset = data.surfaceEffect;
  const preset = PRESET_BY_ID.has(requestedPreset as SurfaceEffectPreset)
    ? requestedPreset as SurfaceEffectPreset
    : "flat";
  const defaults = PRESET_BY_ID.get(preset) ?? SURFACE_EFFECT_PRESETS[0];
  return {
    preset,
    depth: rounded(clamp(finiteNumber(data.surfaceEffectDepth, defaults.depth), 0, 24)),
    strength: rounded(clamp(finiteNumber(data.surfaceEffectStrength, defaults.strength), 0, 100)),
    angle: rounded(clamp(finiteNumber(data.surfaceEffectAngle, defaults.angle), -180, 180)),
  };
}

export function surfaceEffectPresetPatch(preset: SurfaceEffectPreset): Record<string, unknown> {
  const settings = PRESET_BY_ID.get(preset) ?? SURFACE_EFFECT_PRESETS[0];
  return {
    surfaceEffect: settings.id,
    surfaceEffectDepth: settings.depth,
    surfaceEffectStrength: settings.strength,
    surfaceEffectAngle: settings.angle,
  };
}

function effectGeometry(settings: SurfaceEffectSettings) {
  const radians = settings.angle * Math.PI / 180;
  const offset = settings.depth * 0.62;
  return {
    dx: rounded(Math.cos(radians) * offset),
    dy: rounded(Math.sin(radians) * offset),
    blur: rounded(Math.max(2, settings.depth * 1.55)),
    strength: settings.strength / 100,
  };
}

function rgba(red: number, green: number, blue: number, alpha: number): string {
  return `rgba(${red},${green},${blue},${rounded(clamp(alpha, 0, 1))})`;
}

function glowColor(accentColor: string | undefined, strength: number): string {
  const accent = surfaceEffectAccentColor(accentColor);
  return `color-mix(in srgb, ${accent} ${Math.round(clamp(strength * 100, 0, 100))}%, transparent)`;
}

function surfaceEffectAccentColor(accentColor: string | undefined): string {
  const requested = accentColor?.trim();
  return !requested || requested.toLowerCase() === "transparent"
    ? "#6366f1"
    : requested;
}

export function surfaceEffectStyle(
  data: Record<string, unknown>,
  accentColor?: string
): SurfaceEffectStyle {
  const settings = normalizeSurfaceEffect(data);
  if (settings.preset === "flat" || settings.depth <= 0 || settings.strength <= 0) return {};

  const { dx, dy, blur, strength } = effectGeometry(settings);
  const dark = rgba(2, 6, 23, 0.08 + strength * 0.38);
  const softDark = rgba(2, 6, 23, 0.04 + strength * 0.19);
  const highlight = rgba(255, 255, 255, 0.1 + strength * 0.5);
  const shade = rgba(2, 6, 23, 0.04 + strength * 0.22);
  const gradientAngle = Math.round(settings.angle + 90);

  if (settings.preset === "soft") {
    return {
      boxShadow: `${dx}px ${dy}px ${blur}px ${softDark}`,
    };
  }

  if (settings.preset === "raised") {
    return {
      backgroundImage: `linear-gradient(${gradientAngle}deg, ${highlight} 0%, transparent 42%, ${shade} 100%)`,
      backgroundBlendMode: "soft-light",
      boxShadow: [
        `${dx}px ${dy}px ${blur}px ${dark}`,
        `inset 0 1px 0 ${highlight}`,
        `inset 0 -1px 0 ${shade}`,
      ].join(","),
    };
  }

  if (settings.preset === "bevel") {
    const inset = rounded(Math.max(1, settings.depth * 0.32));
    return {
      backgroundImage: `linear-gradient(${gradientAngle}deg, ${highlight} 0%, transparent 44%, ${shade} 100%)`,
      backgroundBlendMode: "overlay",
      boxShadow: [
        `inset ${-inset}px ${-inset}px ${rounded(inset * 1.8)}px ${highlight}`,
        `inset ${inset}px ${inset}px ${rounded(inset * 1.9)}px ${shade}`,
        `${rounded(dx * 0.55)}px ${rounded(dy * 0.55)}px ${rounded(blur * 0.65)}px ${softDark}`,
      ].join(","),
    };
  }

  if (settings.preset === "metallic") {
    const metalHighlight = rgba(255, 255, 255, 0.2 + strength * 0.58);
    const metalReflection = rgba(255, 255, 255, 0.05 + strength * 0.2);
    const metalShade = rgba(2, 6, 23, 0.1 + strength * 0.34);
    return {
      backgroundImage: [
        `linear-gradient(${gradientAngle}deg, ${metalShade} 0%, transparent 14%, ${metalReflection} 24%, ${metalHighlight} 34%, ${metalReflection} 42%, transparent 55%, ${metalShade} 68%, transparent 80%, ${metalHighlight} 91%, ${metalShade} 100%)`,
        `linear-gradient(${gradientAngle + 90}deg, ${metalReflection} 0%, transparent 38%, ${metalShade} 100%)`,
      ].join(","),
      backgroundBlendMode: "overlay,soft-light",
      boxShadow: [
        `${rounded(dx * 0.42)}px ${rounded(dy * 0.42)}px ${rounded(blur * 0.58)}px ${softDark}`,
        `inset 0 1px 0 ${metalHighlight}`,
        `inset 0 -1px 0 ${metalShade}`,
      ].join(","),
    };
  }

  if (settings.preset === "glass") {
    const glassHighlight = rgba(255, 255, 255, 0.15 + strength * 0.52);
    return {
      backgroundImage: [
        `linear-gradient(${gradientAngle}deg, ${glassHighlight} 0%, ${rgba(255, 255, 255, strength * 0.08)} 46%, transparent 47%)`,
        `linear-gradient(${gradientAngle + 180}deg, ${shade} 0%, transparent 55%)`,
      ].join(","),
      backgroundBlendMode: "screen,soft-light",
      backdropFilter: `blur(${rounded(2 + settings.depth * 0.45)}px) saturate(${rounded(1 + strength * 0.32)})`,
      boxShadow: [
        `${rounded(dx * 0.65)}px ${rounded(dy * 0.65)}px ${blur}px ${softDark}`,
        `inset 0 1px 0 ${glassHighlight}`,
      ].join(","),
    };
  }

  return {
    boxShadow: [
      `0 0 ${rounded(blur * 0.8)}px ${glowColor(accentColor, 0.32 + strength * 0.5)}`,
      `0 0 ${rounded(blur * 1.7)}px ${glowColor(accentColor, 0.12 + strength * 0.24)}`,
      `inset 0 0 ${rounded(Math.max(1, settings.depth * 0.5))}px ${glowColor(accentColor, 0.08 + strength * 0.16)}`,
    ].join(","),
  };
}

export function surfaceEffectFilter(
  data: Record<string, unknown>,
  accentColor?: string
): string | undefined {
  const settings = normalizeSurfaceEffect(data);
  if (settings.preset === "flat" || settings.depth <= 0 || settings.strength <= 0) return undefined;
  const { dx, dy, blur, strength } = effectGeometry(settings);
  if (settings.preset === "glow") {
    return [
      `drop-shadow(0 0 ${rounded(blur * 0.45)}px ${glowColor(accentColor, 0.3 + strength * 0.5)})`,
      `drop-shadow(0 0 ${rounded(blur)}px ${glowColor(accentColor, 0.12 + strength * 0.25)})`,
    ].join(" ");
  }
  return `drop-shadow(${dx}px ${dy}px ${rounded(Math.max(1, blur * 0.42))}px ${rgba(2, 6, 23, 0.08 + strength * 0.32)})`;
}

/**
 * Structured outer shadows used by the native SVG export paint layer.
 * `blur` retains the CSS blur-radius convention; the SVG renderer converts it
 * to a Gaussian standard deviation when it builds filter primitives.
 */
export function surfaceEffectExportShadowLayers(
  data: Record<string, unknown>,
  accentColor?: string
): SurfaceEffectShadowLayer[] {
  const settings = normalizeSurfaceEffect(data);
  if (settings.preset === "flat" || settings.depth <= 0 || settings.strength <= 0) return [];

  const { dx, dy, blur, strength } = effectGeometry(settings);
  if (settings.preset === "glow") {
    return [
      {
        dx: 0,
        dy: 0,
        blur: rounded(blur * 0.45),
        color: surfaceEffectAccentColor(accentColor),
        opacity: rounded(clamp(0.3 + strength * 0.5, 0, 1)),
      },
      {
        dx: 0,
        dy: 0,
        blur: rounded(blur),
        color: surfaceEffectAccentColor(accentColor),
        opacity: rounded(clamp(0.12 + strength * 0.25, 0, 1)),
      },
    ];
  }

  return [{
    dx,
    dy,
    blur: rounded(Math.max(1, blur * 0.42)),
    color: "#020617",
    opacity: rounded(clamp(0.08 + strength * 0.32, 0, 1)),
  }];
}

function splitCssLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers.filter(Boolean);
}

/**
 * Retain only surface-local paint on the exported HTML element. Outer depth is
 * rendered separately by native SVG because HTML shadows and filters can both
 * become rectangular bands inside an SVG foreignObject.
 */
export function surfaceEffectExportStyle(
  data: Record<string, unknown>,
  accentColor?: string
): SurfaceEffectStyle {
  if (surfaceEffectExportShadowLayers(data, accentColor).length === 0) return {};

  const { boxShadow, ...surfaceStyle } = surfaceEffectStyle(data, accentColor);
  const insetShadow = boxShadow
    ? splitCssLayers(boxShadow)
        .filter((layer) => /(?:^|\s)inset(?:\s|$)/i.test(layer))
        .join(",")
    : "";

  return {
    ...surfaceStyle,
    ...(insetShadow ? { boxShadow: insetShadow } : {}),
  };
}
