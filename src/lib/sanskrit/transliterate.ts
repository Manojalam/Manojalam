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

export const IAST_QUICK_INSERT = [
  { label: "ā", char: "ā" },
  { label: "ī", char: "ī" },
  { label: "ū", char: "ū" },
  { label: "ṛ", char: "ṛ" },
  { label: "ṝ", char: "ṝ" },
  { label: "ḷ", char: "ḷ" },
  { label: "ṅ", char: "ṅ" },
  { label: "ñ", char: "ñ" },
  { label: "ṭ", char: "ṭ" },
  { label: "ḍ", char: "ḍ" },
  { label: "ṇ", char: "ṇ" },
  { label: "ś", char: "ś" },
  { label: "ṣ", char: "ṣ" },
  { label: "ṃ", char: "ṃ" },
  { label: "ḥ", char: "ḥ" },
];

export const DEVANAGARI_QUICK_INSERT = [
  { label: "ॐ", char: "ॐ" },
  { label: "ऽ", char: "ऽ" },
  { label: "।", char: "।" },
  { label: "॥", char: "॥" },
];

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
