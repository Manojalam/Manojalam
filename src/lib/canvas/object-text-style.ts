import type { CSSProperties } from "react";
import { PARAGRAPH_KEYS, paragraphValue } from "./paragraph-layout";

/** Inherited object defaults; explicit paragraph styles still win. */
export function objectTextDefaults(data: Record<string, unknown>): CSSProperties {
  return {
    textAlign: data.textAlign as CSSProperties["textAlign"],
    ...Object.fromEntries(PARAGRAPH_KEYS.flatMap(key => data[key] == null ? [] : [[`--object-${key}`, `${paragraphValue(key, data[key])}${key === "paragraphIndent" || key === "firstLineIndent" ? "em" : ""}`]])),
  };
}
export const OBJECT_TEXT_DEFAULTS_CLASS = "[&_.ProseMirror]:!leading-[var(--object-lineSpacing,inherit)] [&_.ProseMirror_p]:[padding-left:var(--object-paragraphIndent,0)] [&_.ProseMirror_p]:[text-indent:var(--object-firstLineIndent,0)] [&_.ProseMirror_p]:[tab-size:var(--object-tabSize,4)]";
