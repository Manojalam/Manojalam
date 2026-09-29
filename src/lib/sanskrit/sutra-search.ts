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
  return entries.filter(entry => entry.number.startsWith(number) || words.every(word => normalizeSutraQuery(`${entry.text} ${entry.roman}`).includes(word)))
    .sort((a, b) => Number(b.number === number) - Number(a.number === number)).slice(0, 30);
}

export function sutraFieldValue(entry: SutraEntry) {
  return {
    text: `${entry.number.replace(/[0-9]/g, digit => String.fromCharCode(0x966 + Number(digit)))} ${entry.text}`,
    href: `https://ashtadhyayi.com/sutraani/${entry.number.replace(/\./g, "/")}`,
  };
}
