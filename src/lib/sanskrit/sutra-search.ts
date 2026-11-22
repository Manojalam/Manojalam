export interface SutraEntry { number: string; text: string; roman: string }

export function normalizeSutraQuery(value: string): string {
  return value.normalize("NFC").replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x966))
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\u200c\u200d]/g, "").trim();
}

export function searchSutras(entries: SutraEntry[], query: string): SutraEntry[] {
  const normalized = normalizeSutraQuery(query);
  if (!normalized) return [];
  const number = normalized.replace(/^https?:\/\/ashtadhyayi\.com\/sutraani\//, "").replace(/[\/।\s-]+/g, ".").replace(/\.$/, "");
  const words = normalized.split(/\s+/);
  const phrase = (value: string) => normalizeSutraQuery(value).replace(/[।॥]+$/g, "").trim().replace(/\s+/g, " ");
  const queryPhrase = phrase(query);
  if (!queryPhrase) return [];
  // Rank the full catalog before limiting results. Short complete sutras can
  // otherwise disappear behind many earlier, incidental substring matches.
  return entries.map(entry => {
    const text = phrase(entry.text);
    const roman = phrase(entry.roman);
    const exactText = text === queryPhrase || roman.replace(/\s/g, "") === queryPhrase.replace(/\s/g, "");
    const rank = entry.number === number ? 0
      : exactText ? 1
      : entry.number.startsWith(number) ? 2
      : text.startsWith(queryPhrase) || roman.startsWith(queryPhrase) ? 3
      : text.includes(queryPhrase) || roman.includes(queryPhrase) ? 4
      : words.every(word => `${text} ${roman}`.includes(word)) ? 5 : Infinity;
    return { entry, rank };
  }).filter(result => Number.isFinite(result.rank))
    .sort((a, b) => a.rank - b.rank).slice(0, 30).map(result => result.entry);
}

export function sutraFieldValue(entry: SutraEntry) {
  return {
    text: `${entry.number.replace(/[0-9]/g, digit => String.fromCharCode(0x966 + Number(digit)))} ${entry.text}`,
    href: `https://ashtadhyayi.com/sutraani/${entry.number.replace(/\./g, "/")}`,
  };
}
