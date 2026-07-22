const SHAPE_FORMAT_KEYS = [
  "color",
  "fillColor",
  "fillOpacity",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "cornerRadiusPercent",
  "borderRadius",
  "borderLayers",
  "fontSize",
  "fontFamily",
  "fontStyle",
  "fontWeight",
  "maximizeText",
  "textColor",
  "textHighlightColor",
  "textAlign",
  "textVerticalAlign",
  "textPadding",
  "textRotation",
  "scriptMode",
] as const;

type ShapeFormatKey = typeof SHAPE_FORMAT_KEYS[number];

export type ShapeFormatSnapshot = Readonly<Record<ShapeFormatKey, unknown>>;

type GeneratedShapeStyle = Partial<{
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  textColor: string;
  fontSize: number;
}>;

function cloneFormatValue<T>(value: T): T {
  return value && typeof value === "object" ? structuredClone(value) : value;
}

/** Capture visual shape styling without content, geometry, hierarchy, or connection data. */
export function captureShapeFormat(data: Record<string, unknown>): ShapeFormatSnapshot {
  const format = Object.fromEntries(
    SHAPE_FORMAT_KEYS.map((key) => [key, cloneFormatValue(data[key])])
  ) as Record<ShapeFormatKey, unknown>;
  const generated = data.layoutVisualStyle as GeneratedShapeStyle | undefined;

  // Capture what an automatically styled shape actually looks like, then apply
  // it as an explicit style so the destination does not depend on another layout.
  if (generated && data.layoutAutoFill !== false) {
    format.color = undefined;
    format.fillColor = generated.fillColor;
    format.fillOpacity = 1;
  }
  if (generated && data.layoutAutoBorder !== false) {
    format.color = undefined;
    format.borderColor = generated.borderColor;
    format.borderWidth = generated.borderWidth;
    format.borderStyle = generated.borderStyle;
  }
  if (generated && data.layoutAutoText !== false) {
    format.textColor = generated.textColor;
  }
  if (generated && data.layoutAutoTypography !== false) {
    format.fontSize = generated.fontSize;
  }

  return format;
}

/** Build the one-node patch used when painting a captured format onto a shape. */
export function shapeFormatPatch(
  targetData: Record<string, unknown>,
  format: ShapeFormatSnapshot
): Record<string, unknown> {
  const patch = Object.fromEntries(
    SHAPE_FORMAT_KEYS.map((key) => [key, cloneFormatValue(format[key])])
  );

  if (targetData.layoutVisualStyle) {
    patch.layoutAutoFill = false;
    patch.layoutAutoBorder = false;
    patch.layoutAutoText = false;
    patch.layoutAutoTypography = false;
  }

  return patch;
}
