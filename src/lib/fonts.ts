export type FontCategory = "General" | "Serif" | "Monospace" | "Sanskrit / Devanāgarī" | "Indic";

export interface FontOption {
  label: string;
  value: string;          // CSS font-family string (passed to font-family property)
  category: FontCategory;
}

export const FONT_OPTIONS: FontOption[] = [
  // ── General UI ────────────────────────────────────────────────────────────
  { label: "Geist (default)",     value: "var(--font-geist-sans), Geist, sans-serif",      category: "General" },
  { label: "Inter",               value: "Inter, system-ui, sans-serif",                   category: "General" },
  { label: "Arial",               value: "Arial, Helvetica, sans-serif",                   category: "General" },
  { label: "Helvetica",           value: "Helvetica Neue, Helvetica, Arial, sans-serif",   category: "General" },
  { label: "Verdana",             value: "Verdana, Geneva, Tahoma, sans-serif",            category: "General" },
  { label: "Trebuchet MS",        value: "'Trebuchet MS', sans-serif",                     category: "General" },
  { label: "Tahoma",              value: "Tahoma, Geneva, Verdana, sans-serif",            category: "General" },
  { label: "Comic Sans",          value: "'Comic Sans MS', 'Comic Sans', cursive",         category: "General" },

  // ── Serif ─────────────────────────────────────────────────────────────────
  { label: "Georgia",             value: "Georgia, 'Times New Roman', Times, serif",       category: "Serif" },
  { label: "Times New Roman",     value: "'Times New Roman', Times, serif",                category: "Serif" },
  { label: "Lora",                value: "var(--font-lora), Lora, Georgia, serif",         category: "Serif" },
  { label: "Garamond",            value: "Garamond, 'Book Antiqua', Palatino, serif",      category: "Serif" },
  { label: "Palatino",            value: "'Palatino Linotype', Palatino, serif",           category: "Serif" },
  { label: "Noto Serif",          value: "var(--font-noto-serif), 'Noto Serif', serif",    category: "Serif" },

  // ── Monospace ─────────────────────────────────────────────────────────────
  { label: "Geist Mono",          value: "var(--font-geist-mono), 'Geist Mono', monospace",  category: "Monospace" },
  { label: "Courier New",         value: "'Courier New', Courier, monospace",              category: "Monospace" },
  { label: "Monaco",              value: "Monaco, 'Lucida Console', monospace",            category: "Monospace" },
  { label: "Lucida Console",      value: "'Lucida Console', 'Courier New', monospace",     category: "Monospace" },

  // ── Sanskrit / Devanāgarī ─────────────────────────────────────────────────
  { label: "Noto Sans Devanagari",  value: "var(--font-noto-devanagari), 'Noto Sans Devanagari', sans-serif", category: "Sanskrit / Devanāgarī" },
  { label: "Noto Serif Devanagari", value: "var(--font-noto-serif-devanagari), 'Noto Serif Devanagari', serif", category: "Sanskrit / Devanāgarī" },
  { label: "Hind (Devanagari)",   value: "var(--font-hind), Hind, sans-serif",              category: "Sanskrit / Devanāgarī" },
  { label: "Mukta",               value: "var(--font-mukta), Mukta, sans-serif",            category: "Sanskrit / Devanāgarī" },
  { label: "Tiro Devanagari",     value: "var(--font-tiro-devanagari), 'Tiro Devanagari Sanskrit', serif", category: "Sanskrit / Devanāgarī" },
  { label: "Shobhika",            value: "Shobhika, serif",                                 category: "Sanskrit / Devanāgarī" },
  { label: "Siddhanta",           value: "Siddhanta, serif",                                category: "Sanskrit / Devanāgarī" },
  { label: "Sanskrit 2003",       value: "'Sanskrit 2003', serif",                          category: "Sanskrit / Devanāgarī" },
  { label: "Chandas",             value: "Chandas, serif",                                  category: "Sanskrit / Devanāgarī" },
  { label: "Adishila",            value: "Adishila, serif",                                 category: "Sanskrit / Devanāgarī" },
  { label: "Nakula",              value: "Nakula, serif",                                   category: "Sanskrit / Devanāgarī" },
  { label: "Sahadeva",            value: "Sahadeva, serif",                                 category: "Sanskrit / Devanāgarī" },
  { label: "Baloo 2",             value: "'Baloo 2', sans-serif",                           category: "Indic" },
];

/** Group font options by category, preserving order */
export function groupFontsByCategory(fonts: FontOption[]): Map<FontCategory, FontOption[]> {
  const map = new Map<FontCategory, FontOption[]>();
  for (const f of fonts) {
    if (!map.has(f.category)) map.set(f.category, []);
    map.get(f.category)!.push(f);
  }
  return map;
}
