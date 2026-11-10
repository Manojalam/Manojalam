import type { CardFieldValues } from "../types";
import { inlineValueHtml } from "./template-value-html";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
export function linkedFieldHtml(value: { text: string; href?: string; richText?: string }) {
  const text = value.richText ? inlineValueHtml(value.richText) : escape(value.text);
  if (/<a\b/i.test(text)) return text;
  return value.href && /^https?:\/\//i.test(value.href)
    ? `<a href="${escape(value.href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
}

/** Append to the current editable value; each result retains its own source link. */
export function appendSutra(current: CardFieldValues[string] | undefined, next: { text: string; href: string }): CardFieldValues[string] {
  if (!current?.text.trim()) return { ...current, ...next, richText: linkedFieldHtml(next) };
  const previous = linkedFieldHtml(current);
  return {
    ...current,
    text: `${current.text}, ${next.text}`,
    href: undefined,
    richText: `${previous}, ${linkedFieldHtml(next)}`,
  };
}
