import {
  normalizeSymbolAppearance,
  type SemanticSymbolId,
  type SymbolAppearance,
} from "../text-tools";

export function symbolMarkStyle(attributes: SymbolAppearance): string {
  const appearance = normalizeSymbolAppearance(attributes);
  const enclosed = appearance.enclosure !== "none";
  const styles = [
    "align-items:center",
    "box-sizing:border-box",
    "display:inline-flex",
    `font-size:${appearance.scale ?? 1}em`,
    enclosed ? "height:1.45em" : "",
    "justify-content:center",
    "line-height:1",
    enclosed ? "min-width:1.45em" : "",
    enclosed ? "padding:0.08em" : "",
    "vertical-align:middle",
  ];
  if (appearance.font === "tiro-devanagari") {
    styles.push("font-family:var(--font-tiro-devanagari),'Tiro Devanagari Sanskrit',serif");
  }
  if (enclosed) {
    styles.push(`background-color:${appearance.fillColor ?? "transparent"}`);
    styles.push(`border:0.09em solid ${appearance.borderColor ?? "currentColor"}`);
    styles.push(`border-radius:${
      appearance.enclosure === "circle"
        ? "999px"
        : appearance.enclosure === "rounded-square" ? "0.38em" : "0.12em"
    }`);
  }
  return styles.filter(Boolean).join(";");
}

export function hasVisibleSymbolStyle(
  appearance: SymbolAppearance,
  semanticId?: SemanticSymbolId
): boolean {
  const normalized = normalizeSymbolAppearance(appearance);
  return !!semanticId
    || normalized.enclosure !== "none"
    || normalized.font !== "inherit"
    || Math.abs((normalized.scale ?? 1) - 1) > 0.001;
}
