import type { ScriptMode } from "../types";

export const DEVANAGARI_FONT =
  "var(--font-noto-devanagari), 'Noto Sans Devanagari', sans-serif";
export const LATIN_FONT =
  "var(--font-geist-sans), Geist, sans-serif";
export const MIXED_FONT =
  "var(--font-mukta), Mukta, sans-serif";

const DEVANAGARI_PATTERN = /[\u0900-\u097f\ua8e0-\ua8ff]/u;
const LATIN_PATTERN = /[A-Za-z\u00c0-\u024f]/u;

export function normalizeImportedText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[ \t]*\n+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .normalize("NFC");
}

export function scriptModeForText(value: string): ScriptMode {
  const hasDevanagari = DEVANAGARI_PATTERN.test(value);
  const hasLatin = LATIN_PATTERN.test(value);
  if (hasDevanagari && hasLatin) return "mixed";
  if (hasDevanagari) return "devanagari";
  return "plain";
}

export function fontFamilyForScript(scriptMode: ScriptMode): string {
  if (scriptMode === "devanagari") return DEVANAGARI_FONT;
  if (scriptMode === "mixed") return MIXED_FONT;
  return LATIN_FONT;
}

export function fontFamilyForText(value: string): string {
  return fontFamilyForScript(scriptModeForText(value));
}
