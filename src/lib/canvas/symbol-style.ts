import {
  normalizeSymbolAppearance,
  type SemanticSymbolId,
  type SymbolAppearance,
} from "../text-tools";

export interface SymbolMarkAttributes extends SymbolAppearance {
  semanticId?: SemanticSymbolId | null;
}

export function semanticSymbolRotation(semanticId?: SemanticSymbolId | null): number {
  return semanticId === "jihvamuliya" ? 90 : 0;
}

/**
 * Jihvāmūlīya is represented by the two-character pair `)(` and then rotated.
 * Its unrotated width becomes its rendered height, so it needs a smaller
 * optical scale than a single glyph.
 */
export function semanticSymbolScaleFactor(
  semanticId?: SemanticSymbolId | null
): number {
  return semanticId === "jihvamuliya" ? 0.6 : 1;
}

/**
 * Noto and Tiro only draw part of U+1CF6 (or use the Bengali form). Siddhanta
 * and Nirmala UI retain the full upper and lower curves. This changes only
 * the glyph face; the underlying keyboard-entered character remains U+1CF6.
 */
export function semanticSymbolFontFamily(
  semanticId?: SemanticSymbolId | null
): string | undefined {
  return semanticId === "upadhmaniya"
    ? "Siddhanta,'Nirmala UI','Noto Sans Devanagari',sans-serif"
    : undefined;
}

export function symbolMarkStyle(attributes: SymbolMarkAttributes): string {
  const appearance = normalizeSymbolAppearance(attributes);
  const enclosed = appearance.enclosure !== "none";
  const rotation = semanticSymbolRotation(attributes.semanticId);
  const scale = (appearance.scale ?? 1) * semanticSymbolScaleFactor(attributes.semanticId);
  const semanticFont = semanticSymbolFontFamily(attributes.semanticId);
  const transforms = [
    rotation ? `rotate(${rotation}deg)` : "",
    Math.abs(scale - 1) > 0.001 ? `scale(${Number(scale.toFixed(4))})` : "",
  ].filter(Boolean);
  const growthMargin = scale > 1
    ? Number(((scale - 1) * (enclosed ? 0.725 : 0.5)).toFixed(4))
    : 0;
  const styles = [
    "align-items:center",
    "box-sizing:border-box",
    "display:inline-flex",
    "font-size:1em",
    enclosed ? "height:1.45em" : "",
    "justify-content:center",
    "line-height:1",
    growthMargin ? `margin-inline:${growthMargin}em` : "",
    enclosed ? "min-width:1.45em" : "",
    enclosed ? "padding:0.08em" : "",
    "vertical-align:middle",
    transforms.length ? `transform:${transforms.join(" ")}` : "",
    transforms.length ? "transform-origin:center" : "",
    rotation ? "white-space:nowrap" : "",
  ];
  if (semanticFont) {
    styles.push(`font-family:${semanticFont}`);
  } else if (appearance.font === "tiro-devanagari") {
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
