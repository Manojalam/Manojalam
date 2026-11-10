import type { CardFieldValues } from "../types";
import { inlineValueHtml } from "./template-value-html";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
function linkedText(value: { text: string; href?: string }) {
  const text = escape(value.text);
  return value.href && /^https?:\/\//i.test(value.href)
    ? `<a href="${escape(value.href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
}

/** Append to the current editable value; each result retains its own source link. */
export function appendSutra(current: CardFieldValues[string] | undefined, next: { text: string; href: string }): CardFieldValues[string] {
  if (!current?.text.trim()) return { ...current, ...next, richText: undefined };
  const previous = current.richText ? inlineValueHtml(current.richText) : linkedText(current);
  return {
    ...current,
    text: `${current.text}, ${next.text}`,
    href: undefined,
    richText: `${previous}, ${linkedText(next)}`,
  };
}
