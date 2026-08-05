import Sanscript from "@indic-transliteration/sanscript";

export type InputScheme =
  | "iast"
  | "itrans"
  | "hk"
  | "devanagari"
  | "plain";
export type OutputScheme =
  | "devanagari"
  | "iast"
  | "itrans"
  | "hk";

const SCHEME_MAP: Record<InputScheme | OutputScheme, string> = {
  iast: "iast",
  itrans: "itrans",
  hk: "hk",
  devanagari: "devanagari",
  plain: "itrans",
};

export function transliterate(
  text: string,
  from: InputScheme,
  to: OutputScheme
): string {
  if (!text.trim()) return "";
  try {
    const fromScheme = SCHEME_MAP[from];
    const toScheme = SCHEME_MAP[to];
    if (from === "plain" && to === "devanagari") {
      return Sanscript.t(text, "itrans", "devanagari");
    }
    return Sanscript.t(text, fromScheme, toScheme);
  } catch {
    return text;
  }
}

export function devanagariToIast(text: string): string {
  return transliterate(text, "devanagari", "iast");
}

function normalizedIast(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * A blank or truncated prefix is safe to repair automatically. A divergent
 * value is treated as an intentional manual correction and left untouched.
 */
export function shouldRefreshAutomaticIast(
  devanagari: string,
  currentIast: string | undefined
): boolean {
  const automatic = normalizedIast(devanagariToIast(devanagari));
  const current = normalizedIast(currentIast ?? "");
  return automatic.length > 0 && (current.length === 0 || automatic.startsWith(current));
}

export {
  DEVANAGARI_CONSONANTS,
  DEVANAGARI_NUMERALS,
  DEVANAGARI_QUICK_INSERT,
  DEVANAGARI_VOWEL_MARKS,
  DEVANAGARI_VOWELS,
  IAST_QUICK_INSERT,
  PHONETIC_SYMBOLS,
} from "../text-tools";

export const GRAMMAR_CATEGORY_LABELS: Record<string, string> = {
  sandhi: "Sandhi",
  samasa: "Samāsa",
  vibhakti: "Vibhakti",
  tinganta: "Tiṅanta",
  krdanta: "Kṛdanta",
  taddhita: "Taddhita",
  avyaya: "Avyaya",
  chandas: "Chandas",
  alankara: "Alaṅkāra",
  other: "Other",
};
