import type { Node } from "@xyflow/react";

import type {
  ConcentricShapeLayer,
  RadialChartData,
  RadialChartRing,
  RadialChartSegment,
  RelationshipDiagramItemStyle,
  RelationshipDiagramSpec,
} from "../types";

export type SelectionTextStyleKey =
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "textColor";

const TEXT_NODE_TYPES = new Set([
  "mindmap",
  "sticky",
  "text",
  "shape",
  "sanskrit",
  "shloka",
  "grammar",
  "frame",
  "sunburst",
  "relationshipDiagram",
]);

const RELATIONSHIP_SPEC_KEY: Record<
  SelectionTextStyleKey,
  "fontFamily" | "textSize" | "fontWeight" | "fontStyle" | "textColor"
> = {
  fontFamily: "fontFamily",
  fontSize: "textSize",
  fontWeight: "fontWeight",
  fontStyle: "fontStyle",
  textColor: "textColor",
};

const RADIAL_CENTER_KEY: Record<
  SelectionTextStyleKey,
  | "centerFontFamily"
  | "centerFontSize"
  | "centerFontWeight"
  | "centerFontStyle"
  | "centerTextColor"
> = {
  fontFamily: "centerFontFamily",
  fontSize: "centerFontSize",
  fontWeight: "centerFontWeight",
  fontStyle: "centerFontStyle",
  textColor: "centerTextColor",
};

function sameValue(values: unknown[]): unknown {
  if (!values.length) return undefined;
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

function nestedShapeTextValues(
  data: Record<string, unknown>,
  key: SelectionTextStyleKey
): unknown[] {
  const values: unknown[] = [data[key]];
  const layers = Array.isArray(data.concentricLayers)
    ? data.concentricLayers as ConcentricShapeLayer[]
    : [];
  for (const layer of layers) {
    if (layer.text?.trim()) values.push(layer[key]);
  }

  const chart = data.radialChart as RadialChartData | undefined;
  if (!chart?.enabled) return values;
  if (chart.centerText?.trim()) values.push(chart[RADIAL_CENTER_KEY[key]]);
  for (const ring of chart.rings ?? []) {
    for (const segment of ring.segments ?? []) {
      if (segment.text?.trim()) values.push(segment[key]);
    }
  }
  return values;
}

function patchShapeTextSurfaces(
  data: Record<string, unknown>,
  key: SelectionTextStyleKey,
  value: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const layers = Array.isArray(data.concentricLayers)
    ? data.concentricLayers as ConcentricShapeLayer[]
    : [];
  if (layers.length) {
    patch.concentricLayers = layers.map((layer) => ({
      ...layer,
      [key]: value,
    }));
  }

  const chart = data.radialChart as RadialChartData | undefined;
  if (!chart?.enabled) return patch;
  const centerKey = RADIAL_CENTER_KEY[key];
  patch.radialChart = {
    ...chart,
    [centerKey]: value,
    rings: (chart.rings ?? []).map((ring: RadialChartRing) => ({
      ...ring,
      segments: (ring.segments ?? []).map((segment: RadialChartSegment) => ({
        ...segment,
        [key]: value,
      })),
    })),
  };
  return patch;
}

function patchRelationshipDiagram(
  data: Record<string, unknown>,
  key: SelectionTextStyleKey,
  value: unknown
): Record<string, unknown> {
  const spec = data.relationshipDiagramSpec
    && typeof data.relationshipDiagramSpec === "object"
    ? data.relationshipDiagramSpec as Partial<RelationshipDiagramSpec>
    : {};
  const specKey = RELATIONSHIP_SPEC_KEY[key];
  const itemKey = key === "fontSize" ? "fontSize" : key;
  const existingItemStyles = (spec.itemStyles ?? {}) as Record<
    string,
    RelationshipDiagramItemStyle
  >;
  const itemStyles = Object.fromEntries(
    Object.entries(existingItemStyles).map(([itemId, style]) => {
      const nextStyle = { ...style } as RelationshipDiagramItemStyle;
      delete nextStyle[itemKey as keyof RelationshipDiagramItemStyle];
      return [itemId, nextStyle];
    })
  );
  const nextSpec = {
    ...spec,
    [specKey]: value,
    ...(key === "textColor" ? { centerTextColor: undefined } : {}),
    ...(Object.keys(itemStyles).length ? { itemStyles } : {}),
  };
  return {
    relationshipDiagramSpec: nextSpec,
  };
}

export function supportsSelectionTextStyle(node: Node): boolean {
  return TEXT_NODE_TYPES.has(node.type ?? "");
}

export function selectionNodeTextStyleValue(
  node: Node,
  key: SelectionTextStyleKey
): unknown {
  if (!supportsSelectionTextStyle(node)) return undefined;
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "relationshipDiagram") {
    const spec = data.relationshipDiagramSpec
      && typeof data.relationshipDiagramSpec === "object"
      ? data.relationshipDiagramSpec as Partial<RelationshipDiagramSpec>
      : {};
    return spec[RELATIONSHIP_SPEC_KEY[key]];
  }
  if (key === "textColor" && typeof data.sunburstHiddenFor === "string") {
    return data.radialTextColor ?? data.textColor;
  }
  if (node.type === "shape") {
    return sameValue(nestedShapeTextValues(data, key));
  }
  return data[key];
}

/**
 * Builds one whole-object typography patch. `basePatch` contains the normal
 * rich-text cleanup and generated-layout opt-outs used by ordinary nodes.
 */
export function selectionNodeTextStylePatch(
  node: Node,
  key: SelectionTextStyleKey,
  value: unknown,
  basePatch: Record<string, unknown>
): Record<string, unknown> {
  if (!supportsSelectionTextStyle(node)) return {};
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "relationshipDiagram") {
    return patchRelationshipDiagram(data, key, value);
  }
  if (key === "textColor" && typeof data.sunburstHiddenFor === "string") {
    const radialPatch: Record<string, unknown> = {
      ...basePatch,
      radialTextColor: value,
    };
    delete radialPatch.textColor;
    return radialPatch;
  }
  if (node.type === "shape") {
    return patchShapeTextSurfaces(data, key, value, { ...basePatch });
  }
  return basePatch;
}
