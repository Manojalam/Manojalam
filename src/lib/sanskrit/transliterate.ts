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

export { IAST_QUICK_INSERT, DEVANAGARI_QUICK_INSERT } from "@/lib/text-tools";

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
