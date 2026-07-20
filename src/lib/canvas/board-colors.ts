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

/**
 * Old boards persisted the light defaults as if they were custom colors.
 * Treat either built-in theme value as automatic so those boards can follow
 * light/dark mode without losing genuine custom or transparent choices.
 */
export function normalizeBoardColorOverride(
  value: string | null | undefined,
  kind: BoardColorKind
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const comparable = normalized.toLowerCase();
  if (
    comparable === BOARD_THEME_COLORS.light[kind]
    || comparable === BOARD_THEME_COLORS.dark[kind]
  ) return undefined;
  return normalized;
}

export function boardColorCssValue(
  value: string | null | undefined,
  kind: BoardColorKind
): string {
  return normalizeBoardColorOverride(value, kind) ?? BOARD_COLOR_VARIABLES[kind];
}

export function resolvedBoardColor(
  value: string | null | undefined,
  kind: BoardColorKind,
  theme: BoardColorTheme
): string {
  return normalizeBoardColorOverride(value, kind) ?? BOARD_THEME_COLORS[theme][kind];
}

export function usesAutomaticBoardColor(
  value: string | null | undefined,
  kind: BoardColorKind
): boolean {
  return normalizeBoardColorOverride(value, kind) === undefined;
}
