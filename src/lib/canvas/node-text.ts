export const NODE_TEXT_FIELDS = [
  "text",
  "title",
  "topic",
  "label",
  "devanagari",
  "iast",
  "translation",
  "rule",
] as const;

function duplicateKey(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] !== "#") return named[token.toLowerCase()] ?? entity;
    const hexadecimal = token[1]?.toLowerCase() === "x";
    const numeric = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(numeric);
    } catch {
      return entity;
    }
  });
}

/** Convert authored rich text to the same readable plain text used by charts. */
export function nodeRichTextPlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Return authored text fields once each. Imported hierarchies historically
 * stored the same title in both `text` and `label`; normalization here keeps
 * existing boards readable without discarding distinct semantic fields.
 */
export function uniqueNodeTextValues(data: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const field of NODE_TEXT_FIELDS) {
    const value = data[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = duplicateKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(trimmed);
  }
  return values;
}

/** Prefer rich text when present; otherwise combine distinct authored fields. */
export function nodePlainText(
  data: Record<string, unknown>,
  separator = "\n"
): string {
  const richText = nodeRichTextPlainText(data.richText);
  if (richText) return richText;
  return uniqueNodeTextValues(data).join(separator).trim();
}
