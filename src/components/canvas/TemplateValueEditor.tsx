"use client";

import { RichTextEditor } from "./RichTextEditor";
import { inlineValueHtml, templateValueText, valueParagraphStyle } from "@/lib/canvas/template-value-html";
import type { CardFieldValues } from "@/lib/types";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

/** Use the same editor and formatting tools as canvas text; only overrides belong to this value. */
export function TemplateValueEditor({ id, label, value, disabled, onChange }: {
  id: string; label: string; value?: CardFieldValues[string]; disabled: boolean;
  onChange: (value: Partial<CardFieldValues[string]>) => void;
}) {
  const content = value?.richText ? inlineValueHtml(value.richText) : escape(value?.text || "");
  const hasLocalFormatting = !!value?.paragraphStyle || /<(strong|b|em|i|u|s|sup|sub|mark|a)\b|\sstyle=/.test(value?.richText || "");
  return <div className="min-h-9 rounded-md border bg-background p-2 text-sm">
    {hasLocalFormatting && <button type="button" disabled={disabled} className="mb-1 block text-xs text-muted-foreground hover:underline" title="Remove local formatting from this value and use the linked template defaults" onClick={() => onChange({ text: value?.text || "", richText: undefined, paragraphStyle: undefined })}>Use template styling</button>}
    <RichTextEditor templateText valueInput inputId={id} inputLabel={label} initialContent={`<p style="${valueParagraphStyle(value?.paragraphStyle || "")}">${content}</p>`} editable={!disabled} onChange={html => {
      const richText = inlineValueHtml(html);
      const paragraph = new DOMParser().parseFromString(html, "text/html").body.querySelector("p");
      onChange({ text: templateValueText(richText), richText, paragraphStyle: valueParagraphStyle(paragraph?.getAttribute("style") || "") });
    }} />
  </div>;
}
