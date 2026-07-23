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
  const requested = accentColor?.trim();
  const accent = !requested || requested.toLowerCase() === "transparent"
    ? "#6366f1"
    : requested;
  return `color-mix(in srgb, ${accent} ${Math.round(clamp(strength * 100, 0, 100))}%, transparent)`;
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
