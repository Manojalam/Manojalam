const INHERITED_NODE_STYLE_FIELDS = [
  "shapeType",
  "color",
  "fillColor",
  "fillOpacity",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "cornerRadiusPercent",
  "borderRadius",
  "fontFamily",
  "fontSize",
  "maximizeText",
  "textColor",
  "scriptMode",
  "petalCount",
  "textFrameStyle",
  "textCalloutDirection",
] as const;

const MANUAL_LAYOUT_STYLE_FIELDS = [
  "layoutAutoFill",
  "layoutAutoBorder",
  "layoutAutoText",
  "layoutAutoTypography",
] as const;

/** Styling fields a child inherits from its parent (not content or generated layout state). */
export function inheritChildNodeStyle(
  parentData: Record<string, unknown>
): Record<string, unknown> {
  const inherited: Record<string, unknown> = {};
  for (const field of INHERITED_NODE_STYLE_FIELDS) {
    if (parentData[field] !== undefined) inherited[field] = parentData[field];
  }
  return inherited;
}

/**
 * A new sibling should match the selected sibling's authored appearance.
 * Preserve only explicit manual-layout flags; generated palette ownership is
 * recalculated for the new node by the active hierarchy layout.
 */
export function inheritSiblingNodeStyle(
  siblingData: Record<string, unknown>
): Record<string, unknown> {
  const inherited = inheritChildNodeStyle(siblingData);
  for (const field of MANUAL_LAYOUT_STYLE_FIELDS) {
    if (siblingData[field] === false) inherited[field] = false;
  }
  return inherited;
}
