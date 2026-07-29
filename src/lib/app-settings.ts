import {
  mergeCustomColors,
  normalizeCustomColors,
} from "./canvas/custom-colors";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type BoardSettings,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Restore defaults missing from older local preferences and validate saved colors. */
export function normalizeAppSettings(value: unknown): AppSettings {
  const saved = isRecord(value) ? value : {};
  return {
    ...DEFAULT_APP_SETTINGS,
    ...saved,
    customColors: normalizeCustomColors(saved.customColors),
  } as AppSettings;
}

/**
 * Import colors saved by the older per-board implementation without evicting
 * colors that are already part of the app-wide palette.
 */
export function mergeBoardColorsIntoAppPalette(
  appColors: unknown,
  boardSettings: Pick<
    BoardSettings,
    "customColors" | "customTextColors" | "customHighlightColors"
  >
): string[] {
  const appPalette = normalizeCustomColors(appColors);
  const appColorSet = new Set(appPalette);
  const legacyBoardColors = mergeCustomColors(
    boardSettings.customColors,
    boardSettings.customTextColors,
    boardSettings.customHighlightColors,
  ).filter((color) => !appColorSet.has(color));

  return mergeCustomColors(
    legacyBoardColors,
    appPalette,
  );
}
