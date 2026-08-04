import type { Edge, Node } from "@xyflow/react";
import type {
  LayoutColorPattern,
  LayoutMode,
  LayoutVisualStyle,
  RadialColorScheme,
  VidyaEdgeData,
} from "../types";
import { isMetallicColor } from "../canvas/custom-colors";
import { reclaimAutomaticTextColor } from "../canvas/sticker-text-protection";
import {
  normalizeSurfaceEffect,
  surfaceEffectPresetPatch,
} from "../canvas/surface-effects";
import {
  automaticLayoutBorderColor,
  automaticLayoutTextColor,
  DEFAULT_LAYOUT_BRANCH_LIGHTNESS,
  DEFAULT_RADIAL_COLOR_SCHEME,
  LAYOUT_TEXT_COLOR_VERSION,
  layoutBranchAnchorColor,
  layoutBorderLineStyle,
  layoutColorPattern,
  layoutColorPatternProgress,
  layoutRootPaletteGradient,
  layoutTextTreatment,
  radialColorScheme,
  radialSectorColors,
  uniformLayoutTextColor,
} from "../radial-layout";
import { getLayoutOwnedSubtree, getSubtree, type Hierarchy } from "./hierarchy";
import { layoutFontSizeFor } from "./layout-presentation";

const AUTOMATIC_COLOR_MODES = new Set<LayoutMode>([
  "freeForm",
  "fromParentFreeForm",
  "mindMap",
  "horizontal",
  "vertical",
  "list",
  "topDown",
  "linear",
  "matrix",
]);

export interface ApplyLayoutPaletteOptions {
  resetOverrides?: boolean;
  resetBorderOverrides?: boolean;
  resetTextOverrides?: boolean;
}

export interface LayoutPaletteResult {
  nodes: Node[];
  edges: Edge[];
}

export interface DescendantFillOverrideReset {
  nodes: Node[];
  resetNodeIds: string[];
}

export function resetDescendantLayoutFillOverrides(
  nodes: Node[],
  hierarchy: Hierarchy,
  ancestorId: string
): DescendantFillOverrideReset {
  const descendantIds = new Set(getSubtree(ancestorId, hierarchy).filter((nodeId) => nodeId !== ancestorId));
  const resetNodeIds = nodes
    .filter((node) => (
      descendantIds.has(node.id)
      && ((node.data ?? {}) as Record<string, unknown>).layoutAutoFill === false
    ))
    .map((node) => node.id);
  if (!resetNodeIds.length) return { nodes, resetNodeIds };

  const resetNodeIdSet = new Set(resetNodeIds);
  return {
    nodes: nodes.map((node) => {
      if (!resetNodeIdSet.has(node.id)) return node;
      const {
        layoutAutoFill: _layoutAutoFill,
        ...data
      } = (node.data ?? {}) as Record<string, unknown>;
      void _layoutAutoFill;
      return { ...node, data };
    }),
    resetNodeIds,
  };
}

export function supportsAutomaticLayoutColors(mode: LayoutMode | undefined): mode is LayoutMode {
  return mode !== undefined && AUTOMATIC_COLOR_MODES.has(mode);
}

export function selectedLayoutColorScheme(value: unknown): RadialColorScheme {
  return radialColorScheme(value ?? DEFAULT_RADIAL_COLOR_SCHEME).id;
}

export function layoutBorderWidthFor(
  mode: LayoutMode,
  depth: number,
  widthValue?: unknown
): number {
  if (mode === "matrix") return 0;
  if (typeof widthValue === "number" && Number.isFinite(widthValue)) {
    return Math.max(0.5, Math.min(6, widthValue));
  }
  if (mode === "list") return depth === 0 ? 2.5 : depth === 1 ? 2 : 1.5;
  return depth === 0 ? 2.5 : 1.75;
}

function branchIndexes(rootId: string, hierarchy: Hierarchy): Map<string, number> {
  const indexes = new Map<string, number>([[rootId, -1]]);
  const rootChildren = hierarchy.get(rootId)?.childIds ?? [];
  rootChildren.forEach((childId, branchIndex) => {
    const visit = (id: string) => {
      if (indexes.has(id)) return;
      indexes.set(id, branchIndex);
      for (const descendantId of hierarchy.get(id)?.childIds ?? []) visit(descendantId);
    };
    visit(childId);
  });
  return indexes;
}

const LAYOUT_METALLIC_SETTINGS = normalizeSurfaceEffect(
  surfaceEffectPresetPatch("metallic")
);

function layoutMetallicEffect(
  pattern: LayoutColorPattern,
  branchIndex: number,
  branchCount: number,
  startColor?: string,
  endColor?: string
): Partial<LayoutVisualStyle> {
  const startIsMetallic = isMetallicColor(startColor);
  const endIsMetallic = isMetallicColor(endColor);
  let metallicAmount = startIsMetallic ? 1 : 0;

  if (pattern === "alternating" || pattern === "duotone" || pattern === "sectioned") {
    const progress = layoutColorPatternProgress(pattern, branchIndex, branchCount);
    metallicAmount = (startIsMetallic ? 1 - progress : 0)
      + (endIsMetallic ? progress : 0);
  }

  if (metallicAmount <= 0) return {};
  return {
    surfaceEffect: LAYOUT_METALLIC_SETTINGS.preset,
    surfaceEffectDepth: LAYOUT_METALLIC_SETTINGS.depth,
    surfaceEffectStrength: Math.round(
      LAYOUT_METALLIC_SETTINGS.strength * metallicAmount * 100
    ) / 100,
    surfaceEffectAngle: LAYOUT_METALLIC_SETTINGS.angle,
  };
}

type ManualFillAnchor = {
  color: string;
  depth: number;
};

function manualLayoutFillColor(data: Record<string, unknown>): string | null {
  if (data.layoutAutoFill !== false) return null;
  const color = typeof data.fillColor === "string"
    ? data.fillColor.trim()
    : typeof data.color === "string" ? data.color.trim() : "";
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) return color;
  if (/^hsla?\(/i.test(color)) return color;
  return null;
}

function manualFillAnchors(
  rootId: string,
  hierarchy: Hierarchy,
  nodes: readonly Node[]
): Map<string, ManualFillAnchor> {
  const dataById = new Map(nodes.map((node) => [
    node.id,
    (node.data ?? {}) as Record<string, unknown>,
  ]));
  const anchors = new Map<string, ManualFillAnchor>();
  const rootDepth = hierarchy.get(rootId)?.depth ?? 0;
  const visited = new Set<string>();

  const visit = (nodeId: string, inherited: ManualFillAnchor | null) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const depth = Math.max(0, (hierarchy.get(nodeId)?.depth ?? rootDepth) - rootDepth);
    const manualColor = manualLayoutFillColor(dataById.get(nodeId) ?? {});
    const anchor = manualColor ? { color: manualColor, depth } : inherited;
    if (anchor) anchors.set(nodeId, anchor);
    for (const childId of hierarchy.get(nodeId)?.childIds ?? []) visit(childId, anchor);
  };

  visit(rootId, null);
  return anchors;
}

export function buildLayoutVisualStyles(
  rootId: string,
  hierarchy: Hierarchy,
  mode: LayoutMode,
  schemeId: RadialColorScheme,
  nodes: readonly Node[] = []
): Map<string, LayoutVisualStyle> {
  const scheme = radialColorScheme(schemeId);
  const rootDepth = hierarchy.get(rootId)?.depth ?? 0;
  const branches = branchIndexes(rootId, hierarchy);
  const branchCount = Math.max(1, hierarchy.get(rootId)?.childIds.length ?? 0);
  const rootData = (nodes.find((node) => node.id === rootId)?.data ?? {}) as Record<string, unknown>;
  const layoutStartColor = typeof rootData.layoutStartColor === "string"
    ? rootData.layoutStartColor
    : undefined;
  const colorPattern = layoutColorPattern(
    rootData.layoutColorPattern ?? rootData.matrixRowColorPattern,
    mode === "matrix" ? "flow" : "curated"
  );
  const layoutEndColor = typeof rootData.layoutEndColor === "string"
    ? rootData.layoutEndColor
    : typeof rootData.matrixRowEndColor === "string" ? rootData.matrixRowEndColor
    : undefined;
  const branchLightness = mode === "matrix"
    ? DEFAULT_LAYOUT_BRANCH_LIGHTNESS
    : scheme.lightness;
  const borderTreatment = rootData.layoutBorderTreatment;
  const borderLineStyle = layoutBorderLineStyle(rootData.layoutBorderStyle);
  const borderWidthValue = rootData.layoutBorderWidth;
  const textTreatment = layoutTextTreatment(rootData.layoutTextTreatment);
  const fillAnchors = manualFillAnchors(rootId, hierarchy, nodes);
  const styles = new Map<string, LayoutVisualStyle>();
  const layoutNodeIds = nodes.length
    ? getLayoutOwnedSubtree(rootId, hierarchy, nodes)
    : getSubtree(rootId, hierarchy);

  for (const nodeId of layoutNodeIds) {
    const info = hierarchy.get(nodeId);
    const depth = Math.max(0, (info?.depth ?? rootDepth) - rootDepth);
    const branchIndex = Math.max(0, branches.get(nodeId) ?? 0);
    const fillAnchor = fillAnchors.get(nodeId);
    const manualColor = fillAnchor?.depth === depth ? fillAnchor.color : undefined;
    if (nodeId === rootId) {
      const manualColors = manualColor
        ? radialSectorColors(scheme, 0, 1, 0, 1, manualColor, manualColor)
        : null;
      const fillColor = manualColors?.fill ?? scheme.rootFill;
      const coordinatedBorder = manualColors?.border ?? scheme.rootBorder;
      styles.set(nodeId, {
        rootId,
        mode,
        scheme: scheme.id,
        depth,
        branchIndex: -1,
        fillColor,
        ...(!manualColors && mode === "matrix"
          ? {
              fillGradient: layoutRootPaletteGradient(
                scheme,
                branchCount,
                layoutStartColor,
                colorPattern,
                layoutEndColor,
                branchLightness
              ),
            }
          : {}),
        borderColor: automaticLayoutBorderColor(
          fillColor,
          coordinatedBorder,
          borderTreatment,
          depth
        ),
        textColor: automaticLayoutTextColor(
          manualColors?.text ?? scheme.rootText,
          layoutStartColor ?? scheme.rootBorder,
          textTreatment,
          depth
        ),
        accentColor: coordinatedBorder,
        borderWidth: layoutBorderWidthFor(mode, depth, borderWidthValue),
        borderStyle: borderLineStyle,
        fontSize: layoutFontSizeFor(mode, depth),
      });
      continue;
    }

    const parentChildren = info?.parentId
      ? hierarchy.get(info.parentId)?.childIds ?? []
      : [];
    const matrixDepthBand = mode === "matrix";
    const branchBaseColor = fillAnchor?.color
      ?? layoutBranchAnchorColor(
        scheme,
        branchIndex,
        branchCount,
        layoutStartColor,
        colorPattern,
        layoutEndColor,
        branchLightness
      );
    const layoutSurfaceEffect = !fillAnchor
      ? layoutMetallicEffect(
          colorPattern,
          branchIndex,
          branchCount,
          layoutStartColor,
          layoutEndColor
        )
      : {};
    const colors = radialSectorColors(
      scheme,
      branchIndex,
      fillAnchor ? depth - fillAnchor.depth + 1 : depth,
      fillAnchor || matrixDepthBand ? 0 : Math.max(0, info?.siblingIndex ?? 0),
      fillAnchor || matrixDepthBand ? 1 : Math.max(1, parentChildren.length),
      branchBaseColor,
      manualColor,
      !!fillAnchor
    );
    styles.set(nodeId, {
      rootId,
      mode,
      scheme: scheme.id,
      depth,
      branchIndex,
      fillColor: colors.fill,
      ...layoutSurfaceEffect,
      borderColor: automaticLayoutBorderColor(
        colors.fill,
        colors.border,
        borderTreatment,
        depth
      ),
      textColor: automaticLayoutTextColor(
        colors.text,
        branchBaseColor,
        textTreatment,
        depth
      ),
      accentColor: colors.border,
      borderWidth: layoutBorderWidthFor(mode, depth, borderWidthValue),
      borderStyle: borderLineStyle,
      fontSize: layoutFontSizeFor(mode, depth),
    });
  }

  if (textTreatment === "uniform-level") {
    const stylesByDepth = new Map<number, LayoutVisualStyle[]>();
    for (const style of styles.values()) {
      if (style.depth <= 0) continue;
      stylesByDepth.set(style.depth, [
        ...(stylesByDepth.get(style.depth) ?? []),
        style,
      ]);
    }
    for (const levelStyles of stylesByDepth.values()) {
      const textColor = uniformLayoutTextColor(
        levelStyles.map((style) => style.fillColor),
        levelStyles[0]?.textColor
      );
      for (const style of levelStyles) style.textColor = textColor;
    }
  }

  return styles;
}

function markerColor(markerEnd: Edge["markerEnd"]): string | null {
  if (!markerEnd || typeof markerEnd !== "object") return null;
  return typeof markerEnd.color === "string" ? markerEnd.color : null;
}

function markerWithColor(markerEnd: Edge["markerEnd"], color: string | null): Edge["markerEnd"] {
  if (!markerEnd || typeof markerEnd !== "object") return markerEnd;
  const { color: _color, ...rest } = markerEnd;
  void _color;
  return color ? { ...rest, color } : rest;
}

function clearOwnedNodeStyle(node: Node, rootId: string): Node {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const style = data.layoutVisualStyle as Partial<LayoutVisualStyle> | undefined;
  if (style?.rootId !== rootId) return node;
  const { layoutVisualStyle: _layoutVisualStyle, ...nextData } = data;
  void _layoutVisualStyle;
  return { ...node, data: nextData };
}

function clearOwnedEdgeStyle(edge: Edge, rootId: string): Edge {
  const data = (edge.data ?? {}) as VidyaEdgeData;
  if (data.layoutColorRootId !== rootId) return edge;
  const {
    layoutColor: _layoutColor,
    layoutColorRootId: _layoutColorRootId,
    layoutOriginalMarkerColor,
    ...nextData
  } = data;
  void _layoutColor;
  void _layoutColorRootId;
  const restoredMarkerColor = typeof data.color === "string" ? data.color : layoutOriginalMarkerColor ?? null;
  return { ...edge, data: nextData, markerEnd: markerWithColor(edge.markerEnd, restoredMarkerColor) };
}

export function applyLayoutPalette(
  nodes: Node[],
  edges: Edge[],
  hierarchy: Hierarchy,
  rootId: string,
  mode: LayoutMode,
  schemeValue: unknown,
  options: ApplyLayoutPaletteOptions = {}
): LayoutPaletteResult {
  const scopeIds = new Set(getSubtree(rootId, hierarchy));
  if (!supportsAutomaticLayoutColors(mode)) {
    return {
      nodes: nodes.map((node) => clearOwnedNodeStyle(node, rootId)),
      edges: edges.map((edge) => clearOwnedEdgeStyle(edge, rootId)),
    };
  }

  const scheme = selectedLayoutColorScheme(schemeValue);
  const resetOverrides = options.resetOverrides === true;
  const resetBorderOverrides = options.resetBorderOverrides === true;
  const resetTextOverrides = options.resetTextOverrides === true;
  const visualStyles = buildLayoutVisualStyles(
    rootId,
    hierarchy,
    mode,
    scheme,
    resetOverrides ? [] : nodes
  );
  const nextNodes = nodes.map((node) => {
    const visualStyle = visualStyles.get(node.id);
    if (visualStyle) {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const preparedData = resetOverrides || resetTextOverrides
        ? reclaimAutomaticTextColor(data)
        : data;
      const overridePatch = resetOverrides
        ? {
            layoutAutoFill: undefined,
            layoutAutoBorder: undefined,
            layoutAutoText: undefined,
          }
        : {
            ...(resetBorderOverrides ? { layoutAutoBorder: undefined } : {}),
            ...(resetTextOverrides ? { layoutAutoText: undefined } : {}),
          };
      return {
        ...node,
        data: {
          ...preparedData,
          ...overridePatch,
          ...(node.id === rootId
            ? {
                layoutColorScheme: scheme,
                layoutTextColorVersion: LAYOUT_TEXT_COLOR_VERSION,
              }
            : {}),
          layoutVisualStyle: visualStyle,
        },
      };
    }

    const clearedNode = clearOwnedNodeStyle(node, rootId);
    const data = (clearedNode.data ?? {}) as Record<string, unknown>;
    if (data.matrixFrameFor !== rootId) return clearedNode;
    const rootStyle = visualStyles.get(rootId);
    if (!rootStyle) return node;
    return {
      ...clearedNode,
      data: {
        ...data,
        color: rootStyle.borderColor,
        background: `color-mix(in srgb, ${rootStyle.fillColor} 8%, transparent)`,
      },
    };
  });

  const nextEdges = edges.map((edge) => {
    const hierarchyEdge = scopeIds.has(edge.source)
      && scopeIds.has(edge.target)
      && hierarchy.get(edge.target)?.parentId === edge.source;
    if (!hierarchyEdge) return clearOwnedEdgeStyle(edge, rootId);
    const targetStyle = visualStyles.get(edge.target);
    if (!targetStyle) return edge;
    const data = (edge.data ?? {}) as VidyaEdgeData;
    const color = data.color ?? targetStyle.accentColor;
    const originalMarkerColor = "layoutOriginalMarkerColor" in data
      ? data.layoutOriginalMarkerColor ?? null
      : markerColor(edge.markerEnd);
    return {
      ...edge,
      markerEnd: markerWithColor(edge.markerEnd, color),
      data: {
        ...data,
        layoutColor: targetStyle.accentColor,
        layoutColorRootId: rootId,
        layoutOriginalMarkerColor: originalMarkerColor,
      },
    };
  });

  return { nodes: nextNodes, edges: nextEdges };
}
