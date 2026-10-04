import { isInsideEnclosedSticker, protectEnclosedStickerTextStyles } from "./sticker-text-protection";

export function normalizeWholeTextFormat(
  data: Record<string, unknown>,
  key: "fontFamily" | "fontWeight" | "fontStyle" | "textColor" | "textAlign",
  value: unknown
): Record<string, unknown> {
  const patch: Record<string, unknown> = { [key]: value };
  if (typeof data.richText !== "string") return patch;
  const cssProperty = {
    fontFamily: "font-family",
    fontWeight: "font-weight",
    fontStyle: "font-style",
    textColor: "color",
    textAlign: "text-align",
  }[key];
  const fallback = data.richText.replace(new RegExp(`${cssProperty}\\s*:\\s*[^;\"']+;?`, "gi"), "");
  if (typeof document === "undefined") {
    patch.richText = fallback;
    return patch;
  }

  const container = document.createElement("div");
  container.innerHTML = key === "textAlign"
    ? data.richText
    : protectEnclosedStickerTextStyles(data) ?? data.richText;
  container.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    if (isInsideEnclosedSticker(element)) return;
    element.style.removeProperty(cssProperty);
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  });
  if (key === "textColor") {
    container.querySelectorAll<HTMLElement>("[color]").forEach((element) => {
      if (!isInsideEnclosedSticker(element)) element.removeAttribute("color");
    });
  }
  if (key === "fontFamily") {
    container.querySelectorAll<HTMLElement>("[face]").forEach((element) => {
      if (!isInsideEnclosedSticker(element)) element.removeAttribute("face");
    });
  }
  if (key === "textAlign") {
    container.querySelectorAll<HTMLElement>("[align]").forEach((element) => element.removeAttribute("align"));
  }
  if (key === "fontWeight" && value !== "bold") {
    container.querySelectorAll("strong, b").forEach((element) => element.replaceWith(...Array.from(element.childNodes)));
  }
  if (key === "fontStyle" && value !== "italic") {
    container.querySelectorAll("em, i").forEach((element) => element.replaceWith(...Array.from(element.childNodes)));
  }
  container.normalize();
  patch.richText = container.innerHTML || fallback;
  return patch;
}
