function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToRichText(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map(escapeHtml);
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

export function richTextToPlainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Append an OS-clipboard text paste without flattening existing TipTap marks. */
export function appendPlainTextToRichText(
  existingRichText: unknown,
  existingPlainText: string,
  pastedText: string
): string {
  const existing = typeof existingRichText === "string" && existingRichText.trim()
    ? existingRichText.trim()
    : plainTextToRichText(existingPlainText);
  const addition = plainTextToRichText(pastedText);
  if (!existing) return addition;
  if (!addition) return existing;
  return `${existing}${addition}`;
}
