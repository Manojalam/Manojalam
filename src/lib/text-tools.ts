export type ScriptStyle = "superscript" | "subscript";

export type SymbolEnclosure = "none" | "circle" | "square" | "rounded-square";
export type SemanticSymbolId =
  | "mahaprana"
  | "alpaprana"
  | "karkasha"
  | "jihvamuliya"
  | "upadhmaniya";

export interface SymbolAppearance {
  enclosure?: SymbolEnclosure;
  fillColor?: string;
  borderColor?: string;
  scale?: number;
  font?: "inherit" | "tiro-devanagari";
}

export interface InsertSymbol {
  char: string;
  label: string;
  keywords?: readonly string[];
  semanticId?: SemanticSymbolId;
  appearance?: SymbolAppearance;
}

export type SymbolPaletteItem = string | InsertSymbol;

export interface SymbolPaletteGroup {
  id: string;
  label: string;
  symbols: readonly SymbolPaletteItem[];
}

export const TEXT_TOOL_EVENT = "vidya:apply-text-tool";

export type TextToolAction =
  | {
      type: "insert";
      value: string;
      semanticId?: SemanticSymbolId;
      appearance?: SymbolAppearance;
    }
  | { type: "symbol-style"; appearance: SymbolAppearance }
  | { type: "clear-symbol-style" }
  | { type: "script"; style: ScriptStyle }
  | { type: "clear-script" };

const DEFAULT_SYMBOL_APPEARANCE: Required<Pick<SymbolAppearance, "enclosure" | "scale" | "font">> = {
  enclosure: "none",
  scale: 1,
  font: "inherit",
};

function normalizedHexColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

export function normalizeSymbolAppearance(value: SymbolAppearance | undefined): SymbolAppearance {
  const enclosure = value?.enclosure;
  const scale = typeof value?.scale === "number" && Number.isFinite(value.scale)
    ? Math.max(0.75, Math.min(1.6, value.scale))
    : DEFAULT_SYMBOL_APPEARANCE.scale;
  return {
    enclosure: enclosure === "circle"
      || enclosure === "square"
      || enclosure === "rounded-square"
      ? enclosure
      : DEFAULT_SYMBOL_APPEARANCE.enclosure,
    fillColor: normalizedHexColor(value?.fillColor),
    borderColor: normalizedHexColor(value?.borderColor),
    scale,
    font: value?.font === "tiro-devanagari" ? "tiro-devanagari" : DEFAULT_SYMBOL_APPEARANCE.font,
  };
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
] as const;

export const DEVANAGARI_QUICK_INSERT = [
  { label: "Om", char: "ॐ" },
  { label: "Avagraha", char: "ऽ" },
  { label: "Candrabindu", char: "ँ" },
  { label: "Anusvāra", char: "ं" },
  { label: "Visarga", char: "ः" },
  {
    label: "Jihvāmūlīya · जिह्वामूलीय",
    char: ")(",
    keywords: ["jihvamuliya", "jihvāmūlīya", "velar", "visarga", "rotated parentheses"],
    semanticId: "jihvamuliya",
    appearance: { scale: 1.1 },
  },
  {
    label: "Upadhmānīya · उपध्मानीय",
    char: "ᳶ",
    keywords: ["upadhmaniya", "upadhmānīya", "labial", "visarga"],
    semanticId: "upadhmaniya",
    appearance: { scale: 1.2 },
  },
  { label: "Daṇḍa", char: "।" },
  { label: "Double daṇḍa", char: "॥" },
] as const satisfies readonly InsertSymbol[];

export const DEVANAGARI_VOWELS = [
  "अ", "आ", "इ", "ई", "उ", "ऊ", "ऋ", "ॠ", "ऌ", "ॡ", "ए", "ऐ", "ओ", "औ",
] as const;

export const DEVANAGARI_CONSONANTS = [
  "क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ",
  "ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न",
  "प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श",
  "ष", "स", "ह", "ळ", "क्ष", "ज्ञ",
] as const;

export const DEVANAGARI_VOWEL_MARKS = [
  "ा", "ि", "ी", "ु", "ू", "ृ", "ॄ", "ॢ", "ॣ", "े", "ै", "ो", "ौ", "्",
] as const;

export const DEVANAGARI_NUMERALS = [
  "०", "१", "२", "३", "४", "५", "६", "७", "८", "९",
] as const;

export const CHART_MARKERS = [
  { label: "A marker", char: "🅰️" },
  {
    label: "M marker",
    char: "Ⓜ️",
    keywords: ["mahāprāṇa", "mahaprana"],
    appearance: { scale: 1.2 },
  },
  { label: "Glowing star", char: "🌟" },
  { label: "Blossom", char: "🌼" },
] as const satisfies readonly InsertSymbol[];

export const PHONETIC_SYMBOLS = [
  {
    label: "Mahāprāṇa · महाप्राण · strong breath",
    char: "💨",
    keywords: ["mahaprana", "aspirated", "high wind", "strong breath"],
    semanticId: "mahaprana",
  },
  {
    label: "Alpaprāṇa · अल्पप्राण · light breath",
    char: "○",
    keywords: ["alpaprana", "unaspirated", "no wind", "light breath"],
    semanticId: "alpaprana",
  },
  {
    label: "Karkaśa · कर्कश · rough stone",
    char: "🪨",
    keywords: ["karkasha", "karkaśa", "rough", "stone"],
    semanticId: "karkasha",
  },
] as const satisfies readonly InsertSymbol[];

export const STATUS_SYMBOLS = [
  "✓", "✔", "☑", "✅", "✕", "✖", "✗", "✘", "❌", "☐", "☒", "⚠️", "ℹ️", "❗", "❓",
] as const;

export const FLOWER_SYMBOLS = [
  "🌼", "🌸", "🌺", "🌻", "🌹", "🪷", "💐", "❀", "✿", "❁", "✾", "❃",
] as const;

export const STAR_SYMBOLS = [
  "★", "☆", "✦", "✧", "✨", "⭐", "🌟", "💫", "✪", "✯", "✰", "※",
] as const;

export const SHAPE_SYMBOLS = [
  "●", "○", "◉", "◌", "■", "□", "▪", "▫", "◆", "◇", "▲", "△", "▼", "▽", "▶", "◀",
] as const;

export const ENCLOSED_LETTERS = [
  "🅰️", "🅱️",
  {
    label: "M marker",
    char: "Ⓜ️",
    keywords: ["mahāprāṇa", "mahaprana"],
    appearance: { scale: 1.2 },
  },
  "🅾️", "🅿️",
  "Ⓐ", "Ⓑ", "Ⓒ", "Ⓓ", "Ⓔ", "Ⓕ", "Ⓖ", "Ⓗ", "Ⓘ", "Ⓙ", "Ⓚ", "Ⓛ", "Ⓜ",
  "Ⓝ", "Ⓞ", "Ⓟ", "Ⓠ", "Ⓡ", "Ⓢ", "Ⓣ", "Ⓤ", "Ⓥ", "Ⓦ", "Ⓧ", "Ⓨ", "Ⓩ",
] as const satisfies readonly SymbolPaletteItem[];

export const COMMON_SYMBOLS = [
  "©", "®", "™", "§", "¶", "†", "‡", "•", "·", "…", "‰", "№", "@", "#", "&", "%", "‽", "⁂",
] as const;

export const MATH_SYMBOLS = [
  "±", "×", "÷", "≠", "≈", "≤", "≥", "∞", "√", "∑", "∏", "∫",
  "∂", "∇", "∈", "∉", "∪", "∩", "⊂", "⊆", "°", "′", "″", "∴",
] as const;

export const GREEK_SYMBOLS = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "λ", "μ", "π", "ρ",
  "σ", "τ", "φ", "χ", "ψ", "ω", "Γ", "Δ", "Θ", "Λ", "Σ", "Ω",
] as const;

export const ARROW_SYMBOLS = [
  "←", "↑", "→", "↓", "↔", "↕", "⇐", "⇒", "⇔", "↦", "⟶", "⟵",
] as const;

export const GENERAL_SYMBOL_GROUPS = [
  { id: "status", label: "Checks & status", symbols: STATUS_SYMBOLS },
  { id: "phonetics", label: "Phonetics & articulation", symbols: PHONETIC_SYMBOLS },
  { id: "flowers", label: "Flowers & nature", symbols: FLOWER_SYMBOLS },
  { id: "stars", label: "Stars & highlights", symbols: STAR_SYMBOLS },
  { id: "letters", label: "Enclosed letters", symbols: ENCLOSED_LETTERS },
  { id: "shapes", label: "Shapes", symbols: SHAPE_SYMBOLS },
  { id: "common", label: "Common marks", symbols: COMMON_SYMBOLS },
  { id: "math", label: "Math", symbols: MATH_SYMBOLS },
  { id: "greek", label: "Greek", symbols: GREEK_SYMBOLS },
  { id: "arrows", label: "Arrows", symbols: ARROW_SYMBOLS },
] as const satisfies readonly SymbolPaletteGroup[];

export const SANSKRIT_SYMBOL_GROUPS = [
  { id: "articulation", label: "Articulation markers", symbols: PHONETIC_SYMBOLS },
  { id: "iast", label: "IAST", symbols: IAST_QUICK_INSERT },
  { id: "vowels", label: "Devanāgarī vowels", symbols: DEVANAGARI_VOWELS },
  { id: "consonants", label: "Devanāgarī consonants", symbols: DEVANAGARI_CONSONANTS },
  { id: "vowel-marks", label: "Vowel marks & virāma", symbols: DEVANAGARI_VOWEL_MARKS },
  { id: "numerals", label: "Devanāgarī numerals", symbols: DEVANAGARI_NUMERALS },
  { id: "vedic", label: "Sanskrit & Vedic signs", symbols: DEVANAGARI_QUICK_INSERT },
] as const satisfies readonly SymbolPaletteGroup[];

const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ",
  h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ",
  o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ",
  w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
  A: "ᴬ", B: "ᴮ", D: "ᴰ", E: "ᴱ", G: "ᴳ", H: "ᴴ", I: "ᴵ",
  J: "ᴶ", K: "ᴷ", L: "ᴸ", M: "ᴹ", N: "ᴺ", O: "ᴼ", P: "ᴾ",
  R: "ᴿ", T: "ᵀ", U: "ᵁ", V: "ⱽ", W: "ᵂ",
};

const SUBSCRIPT_MAP: Readonly<Record<string, string>> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ",
  m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", x: "ₓ",
};

const BASE_BY_SCRIPT_CHARACTER: Readonly<Record<string, string>> = Object.fromEntries(
  [...Object.entries(SUPERSCRIPT_MAP), ...Object.entries(SUBSCRIPT_MAP)]
    .map(([base, script]) => [script, base])
);

export const SUPERSCRIPT_CHARACTERS = [
  "⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹",
  "⁺", "⁻", "⁼", "⁽", "⁾", "ⁿ", "ˣ", "ʸ",
] as const;

export const SUBSCRIPT_CHARACTERS = [
  "₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉",
  "₊", "₋", "₌", "₍", "₎", "ₙ", "ₓ", "ᵢ",
] as const;

export function convertToScript(value: string, style: ScriptStyle): string {
  const mapping = style === "superscript" ? SUPERSCRIPT_MAP : SUBSCRIPT_MAP;
  return Array.from(value, (character) => {
    const base = BASE_BY_SCRIPT_CHARACTER[character] ?? character;
    return mapping[base] ?? character;
  }).join("");
}

export function clearScriptCharacters(value: string): string {
  return Array.from(value, (character) => BASE_BY_SCRIPT_CHARACTER[character] ?? character).join("");
}

export interface TextRangeEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function replaceTextRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string
): TextRangeEdit {
  const start = Math.max(0, Math.min(value.length, selectionStart));
  const end = Math.max(start, Math.min(value.length, selectionEnd));
  const caret = start + replacement.length;
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

export function transformTextRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transform: (selection: string) => string
): TextRangeEdit | null {
  const start = Math.max(0, Math.min(value.length, selectionStart));
  const end = Math.max(start, Math.min(value.length, selectionEnd));
  if (start === end) return null;
  const replacement = transform(value.slice(start, end));
  const edit = replaceTextRange(value, start, end, replacement);
  return {
    ...edit,
    selectionStart: start,
    selectionEnd: start + replacement.length,
  };
}
