import type { Edge, Node } from "@xyflow/react";
import type {
  LayoutMode,
  LayoutVisualStyle,
  RadialColorScheme,
  VidyaEdgeData,
} from "../types";
import {
  DEFAULT_RADIAL_COLOR_SCHEME,
  radialColorScheme,
  radialSectorColors,
} from "../radial-layout";
import { getSubtree, type Hierarchy } from "./hierarchy";
import { layoutFontSizeFor } from "./layout-presentation";

const AUTOMATIC_COLOR_MODES = new Set<LayoutMode>([
  "fromParentFreeForm",
  "horizontal",
  "vertical",
  "list",
  "topDown",
  "linear",
  "matrix",
]);

export interface ApplyLayoutPaletteOptions {
  resetOverrides?: boolean;
}

export interface LayoutPaletteResult {
  nodes: Node[];
  edges: Edge[];
}

export function supportsAutomaticLayoutColors(mode: LayoutMode | undefined): mode is LayoutMode {
  return mode !== undefined && AUTOMATIC_COLOR_MODES.has(mode);
}

export function selectedLayoutColorScheme(value: unknown): RadialColorScheme {
  return radialColorScheme(value ?? DEFAULT_RADIAL_COLOR_SCHEME).id;
}

function borderWidthFor(mode: LayoutMode, depth: number): number {
  if (mode === "matrix") return depth === 0 ? 2 : depth === 1 ? 1.5 : 1;
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
  const fillAnchors = manualFillAnchors(rootId, hierarchy, nodes);
  const styles = new Map<string, LayoutVisualStyle>();

  for (const nodeId of getSubtree(rootId, hierarchy)) {
    const info = hierarchy.get(nodeId);
    const depth = Math.max(0, (info?.depth ?? rootDepth) - rootDepth);
    const branchIndex = Math.max(0, branches.get(nodeId) ?? 0);
    const fillAnchor = fillAnchors.get(nodeId);
    const manualColor = fillAnchor?.depth === depth ? fillAnchor.color : undefined;
    if (nodeId === rootId) {
      const manualColors = manualColor
        ? radialSectorColors(scheme, 0, 1, 0, 1, manualColor, manualColor)
        : null;
      styles.set(nodeId, {
        rootId,
        mode,
        scheme: scheme.id,
        depth,
        branchIndex: -1,
        fillColor: manualColors?.fill ?? scheme.rootFill,
        borderColor: manualColors?.border ?? scheme.rootBorder,
        textColor: manualColors?.text ?? scheme.rootText,
        accentColor: manualColors?.border ?? scheme.rootBorder,
        borderWidth: borderWidthFor(mode, depth),
        borderStyle: "solid",
        fontSize: layoutFontSizeFor(mode, depth),
      });
      continue;
    }

    const parentChildren = info?.parentId
      ? hierarchy.get(info.parentId)?.childIds ?? []
      : [];
    const colors = radialSectorColors(
      scheme,
      branchIndex,
      fillAnchor ? depth - fillAnchor.depth + 1 : depth,
      fillAnchor ? 0 : Math.max(0, info?.siblingIndex ?? 0),
      fillAnchor ? 1 : Math.max(1, parentChildren.length),
      fillAnchor?.color,
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
      borderColor: colors.border,
      textColor: colors.text,
      accentColor: colors.border,
      borderWidth: borderWidthFor(mode, depth),
      borderStyle: "solid",
      fontSize: layoutFontSizeFor(mode, depth),
    });
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
      const overridePatch = resetOverrides
        ? {
            layoutAutoFill: undefined,
            layoutAutoBorder: undefined,
            layoutAutoText: undefined,
          }
        : {};
      return {
        ...node,
        data: {
          ...data,
          ...overridePatch,
          ...(node.id === rootId ? { layoutColorScheme: scheme } : {}),
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
