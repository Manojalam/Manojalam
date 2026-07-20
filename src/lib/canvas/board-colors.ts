import type { BoardColorMode } from "../types";

export type BoardColorKind = "canvas" | "grid";
export type BoardColorTheme = "light" | "dark";

export const BOARD_THEME_COLORS: Record<BoardColorTheme, Record<BoardColorKind, string>> = {
  light: {
    canvas: "#f0eeea",
    grid: "#d5d2cb",
  },
  dark: {
    canvas: "#18181d",
    grid: "#303038",
  },
};

const BOARD_COLOR_VARIABLES: Record<BoardColorKind, string> = {
  canvas: "var(--canvas-bg)",
  grid: "var(--canvas-dot)",
};

function isTransparentColor(value: string): boolean {
  const comparable = value.toLowerCase().replace(/\s+/g, "");
  return comparable === "transparent"
    || comparable === "#00000000"
    || comparable === "rgba(0,0,0,0)";
}

function parseRgbChannels(value: string): [number, number, number] | null {
  const comparable = value.trim().toLowerCase();
  const hex = comparable.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (hex) {
    return [
      Number.parseInt(hex[1].slice(0, 2), 16),
      Number.parseInt(hex[1].slice(2, 4), 16),
      Number.parseInt(hex[1].slice(4, 6), 16),
    ];
  }

  const rgb = comparable.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number) as [number, number, number];
  return channels.every((channel) => channel >= 0 && channel <= 255) ? channels : null;
}

/**
 * Older boards have no mode field and may contain a neutral palette value as
 * their saved default. These values were intended to follow the app theme.
 */
function isLegacyAutomaticNeutral(value: string, kind: BoardColorKind): boolean {
  const channels = parseRgbChannels(value);
  if (!channels) return false;
  const minimum = Math.min(...channels);
  const maximum = Math.max(...channels);
  if (maximum - minimum > 32) return false;
  return kind === "grid" || maximum >= 224 || minimum <= 64;
}

export function resolveBoardColorMode(
  value: string | null | undefined,
  mode: BoardColorMode | null | undefined,
  kind: BoardColorKind
): BoardColorMode {
  const normalized = value?.trim();
  if (mode === "auto") return "auto";
  if (mode === "transparent") return "transparent";
  if (mode === "custom") return normalized ? "custom" : "auto";
  if (!normalized) return "auto";
  if (isTransparentColor(normalized)) return "transparent";

  const comparable = normalized.toLowerCase();
  if (
    comparable === BOARD_THEME_COLORS.light[kind]
    || comparable === BOARD_THEME_COLORS.dark[kind]
    || isLegacyAutomaticNeutral(normalized, kind)
  ) return "auto";
  return "custom";
}

/**
 * Old boards persisted the light defaults as if they were custom colors.
 * Treat either built-in theme value as automatic so those boards can follow
 * light/dark mode without losing genuine custom or transparent choices.
 */
export function normalizeBoardColorOverride(
  value: string | null | undefined,
  kind: BoardColorKind,
  mode?: BoardColorMode | null
): string | undefined {
  const normalized = value?.trim();
  const resolvedMode = resolveBoardColorMode(normalized, mode, kind);
  if (resolvedMode === "auto") return undefined;
  if (resolvedMode === "transparent") return "transparent";
  return normalized;
}

export function boardColorCssValue(
  value: string | null | undefined,
  kind: BoardColorKind,
  mode?: BoardColorMode | null
): string {
  return normalizeBoardColorOverride(value, kind, mode) ?? BOARD_COLOR_VARIABLES[kind];
}

export function resolvedBoardColor(
  value: string | null | undefined,
  kind: BoardColorKind,
  theme: BoardColorTheme,
  mode?: BoardColorMode | null
): string {
  return normalizeBoardColorOverride(value, kind, mode) ?? BOARD_THEME_COLORS[theme][kind];
}

export function usesAutomaticBoardColor(
  value: string | null | undefined,
  kind: BoardColorKind,
  mode?: BoardColorMode | null
): boolean {
  return resolveBoardColorMode(value, mode, kind) === "auto";
}
