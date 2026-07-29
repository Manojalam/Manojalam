import {
  normalizeCustomColors,
} from "./canvas/custom-colors";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
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
