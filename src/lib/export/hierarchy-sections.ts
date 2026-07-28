import type { Edge, Node } from "@xyflow/react";

import { resolvedFoldSections } from "../layout/child-group-wrap";
import { buildHierarchy } from "../layout/hierarchy";
import { matrixCellBorderRadius } from "../layout/matrix-presentation";
import { resolveConnectorPathStyle } from "../canvas/connector-path-style";
import type { VidyaEdgeData } from "../types";
import {
  computeTightExportBounds,
  resolveExportTarget,
  type ExportDomBoundsContext,
} from "./bounds";
import type {
  ExportHeaderOverlay,
  ExportLayoutAdjustment,
} from "./dom-renderer";
import type { ExportBounds } from "./types";

export interface HierarchySectionExport {
  id: string;
  index: number;
  kind: "child" | "fold";
  label: string;
  childIds: string[];
  nodeIds: string[];
  edgeIds: string[];
  bounds: ExportBounds;
  headerOverlay?: ExportHeaderOverlay;
  layoutAdjustment?: ExportLayoutAdjustment;
}

export interface HierarchySectionExportPlan {
  parentId: string;
  parentLabel: string;
  parentIsMatrix: boolean;
  /** One independently selectable export per direct child. */
  sections: HierarchySectionExport[];
  /** The parent's authored Fold groups; one entry means the parent is not folded. */
  folds: HierarchySectionExport[];
}

export interface HierarchySectionExportPlanOptions {
  padding?: number;
  dom?: ExportDomBoundsContext | null;
}

export type CompactHierarchyDirection = "right" | "left" | "below" | "above";

export interface CompactHierarchyPlacement {
  direction: CompactHierarchyDirection;
  dx: number;
  dy: number;
  bounds: ExportBounds;
}

const COMPACT_PARENT_CHILD_GAP = 48;

export function compactHierarchyPlacement(
  parentBounds: ExportBounds,
  groupBounds: ExportBounds,
  gap = COMPACT_PARENT_CHILD_GAP
): CompactHierarchyPlacement {
  const parentRight = parentBounds.x + parentBounds.width;
  const parentBottom = parentBounds.y + parentBounds.height;
  const groupRight = groupBounds.x + groupBounds.width;
  const groupBottom = groupBounds.y + groupBounds.height;
  const candidates: Array<{ direction: CompactHierarchyDirection; distance: number }> = [
    { direction: "right", distance: groupBounds.x - parentRight },
    { direction: "left", distance: parentBounds.x - groupRight },
    { direction: "below", distance: groupBounds.y - parentBottom },
    { direction: "above", distance: parentBounds.y - groupBottom },
  ];
  let direction = candidates.sort((first, second) => second.distance - first.distance)[0].direction;
  if (candidates[0].distance < 0) {
    const horizontalDelta = (
      groupBounds.x + groupBounds.width / 2
    ) - (
      parentBounds.x + parentBounds.width / 2
    );
    const verticalDelta = (
      groupBounds.y + groupBounds.height / 2
    ) - (
      parentBounds.y + parentBounds.height / 2
    );
    direction = Math.abs(horizontalDelta) >= Math.abs(verticalDelta)
      ? horizontalDelta >= 0 ? "right" : "left"
      : verticalDelta >= 0 ? "below" : "above";
  }

  const dx = direction === "right"
    ? parentRight + gap - groupBounds.x
    : direction === "left"
      ? parentBounds.x - gap - groupRight
      : 0;
  const dy = direction === "below"
    ? parentBottom + gap - groupBounds.y
    : direction === "above"
      ? parentBounds.y - gap - groupBottom
      : 0;
  const movedGroup = {
    x: groupBounds.x + dx,
    y: groupBounds.y + dy,
    width: groupBounds.width,
    height: groupBounds.height,
  };
  const left = Math.min(parentBounds.x, movedGroup.x);
  const top = Math.min(parentBounds.y, movedGroup.y);
  const right = Math.max(parentRight, movedGroup.x + movedGroup.width);
  const bottom = Math.max(parentBottom, movedGroup.y + movedGroup.height);
  return {
    direction,
    dx,
    dy,
    bounds: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
  };
}

function compactConnectorPath(
  parentBounds: ExportBounds,
  targetBounds: ExportBounds,
  direction: CompactHierarchyDirection
): string {
  const parentCenterX = parentBounds.x + parentBounds.width / 2;
  const parentCenterY = parentBounds.y + parentBounds.height / 2;
  const targetCenterX = targetBounds.x + targetBounds.width / 2;
  const targetCenterY = targetBounds.y + targetBounds.height / 2;
  if (direction === "right" || direction === "left") {
    const sourceX = direction === "right"
      ? parentBounds.x + parentBounds.width
      : parentBounds.x;
    const targetX = direction === "right"
      ? targetBounds.x
      : targetBounds.x + targetBounds.width;
    const middleX = (sourceX + targetX) / 2;
    return `M ${sourceX} ${parentCenterY} H ${middleX} V ${targetCenterY} H ${targetX}`;
  }
  const sourceY = direction === "below"
    ? parentBounds.y + parentBounds.height
    : parentBounds.y;
  const targetY = direction === "below"
    ? targetBounds.y
    : targetBounds.y + targetBounds.height;
  const middleY = (sourceY + targetY) / 2;
  return `M ${parentCenterX} ${sourceY} V ${middleY} H ${targetCenterX} V ${targetY}`;
}

function finiteDimension(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_match, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nodeLabel(node: Node | undefined, fallback: string): string {
  const data = (node?.data ?? {}) as Record<string, unknown>;
  return plainText(data.text) || plainText(data.richText) || fallback;
}

function rootHeaderStyle(root: Node, bounds: ExportBounds): ExportHeaderOverlay {
  const data = (root.data ?? {}) as Record<string, unknown>;
  const visual = data.layoutVisualStyle && typeof data.layoutVisualStyle === "object"
    ? data.layoutVisualStyle as Record<string, unknown>
    : null;
  const automaticFill = data.layoutAutoFill !== false;
  const automaticText = data.layoutAutoText !== false;
  const automaticBorder = data.layoutAutoBorder !== false;
  const automaticTypography = data.layoutAutoTypography !== false;
  const fillColor = automaticFill && typeof visual?.fillColor === "string"
    ? visual.fillColor
    : typeof data.fillColor === "string"
      ? data.fillColor
      : typeof data.color === "string" ? data.color : "#ffffff";
  const textColor = automaticText && typeof visual?.textColor === "string"
    ? visual.textColor
    : typeof data.textColor === "string" ? data.textColor : "#111827";
  const borderColor = automaticBorder && typeof visual?.borderColor === "string"
    ? visual.borderColor
    : typeof data.borderColor === "string"
      ? data.borderColor
      : typeof data.color === "string" ? data.color : "transparent";
  const fontSize = automaticTypography
    ? finiteDimension(visual?.fontSize) ?? finiteDimension(data.fontSize) ?? 20
    : finiteDimension(data.fontSize) ?? 20;
  const borderWidth = automaticBorder && data.matrixCell === true && visual
    ? 0
    : Math.max(0, finiteDimension(data.borderWidth) ?? 0);

  return {
    bounds,
    text: nodeLabel(root, "Matrix"),
    backgroundColor: fillColor,
    color: textColor,
    borderColor,
    borderWidth,
    borderStyle: data.borderStyle === "dashed" || data.borderStyle === "dotted"
      ? data.borderStyle
      : "solid",
    borderRadius: matrixCellBorderRadius("header"),
    fontSize,
    fontFamily: typeof data.fontFamily === "string" ? data.fontFamily : undefined,
    fontStyle: data.fontStyle === "italic" ? "italic" : "normal",
    fontWeight: data.fontWeight === "bold" ? 700 : undefined,
  };
}

export function resolveHierarchySectionExportPlan(
  parentId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
  options: HierarchySectionExportPlanOptions = {}
): HierarchySectionExportPlan | null {
  const parent = nodes.find((node) => node.id === parentId && node.hidden !== true);
  const parentData = (parent?.data ?? {}) as Record<string, unknown>;
  if (!parent) return null;
  const parentIsMatrix = parentData.layoutMode === "matrix";

  const padding = options.padding ?? 0;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("Hierarchy section export padding must be a finite non-negative number.");
  }

  const hierarchy = buildHierarchy([...nodes], [...edges]);
  const sectionIds = (hierarchy.get(parentId)?.childIds ?? []).filter((nodeId) =>
    nodes.some((node) => node.id === nodeId && node.hidden !== true));
  if (sectionIds.length === 0) return null;

  const parentTarget = resolveExportTarget(
    { kind: "selection", nodeIds: [parentId], edgeIds: [] },
    nodes,
    edges
  );
  const parentBounds = computeTightExportBounds(parentTarget, {
    padding: 0,
    dom: options.dom,
  });
  const headerHeight = Math.max(1, parentBounds.height);

  const targetForChildren = (childIds: string[]) => {
    const includedNodeIds = new Set<string>();
    for (const childId of childIds) {
      const subtree = resolveExportTarget(
        { kind: "subtree", rootId: childId },
        nodes,
        edges
      );
      for (const nodeId of subtree.nodeIds) includedNodeIds.add(nodeId);
    }
    const childTarget = resolveExportTarget(
      { kind: "selection", nodeIds: [...includedNodeIds], edgeIds: [] },
      nodes,
      edges
    );
    if (parentIsMatrix) return { target: childTarget, childTarget };
    includedNodeIds.add(parentId);
    return {
      childTarget,
      target: resolveExportTarget(
        { kind: "selection", nodeIds: [...includedNodeIds], edgeIds: [] },
        nodes,
        edges
      ),
    };
  };

  const createGroup = (
    id: string,
    index: number,
    kind: HierarchySectionExport["kind"],
    childIds: string[],
    headerBoundsForContent?: (contentBounds: ExportBounds) => ExportBounds
  ): HierarchySectionExport => {
    const { target, childTarget } = targetForChildren(childIds);
    const contentBounds = computeTightExportBounds(target, {
      padding: 0,
      dom: options.dom,
    });
    const childBounds = parentIsMatrix
      ? contentBounds
      : computeTightExportBounds(childTarget, {
          padding: 0,
          dom: options.dom,
        });
    const compactPlacement = parentIsMatrix
      ? null
      : compactHierarchyPlacement(parentBounds, childBounds);
    const headerBounds = parentIsMatrix
      ? headerBoundsForContent?.(contentBounds) ?? {
          x: contentBounds.x,
          y: contentBounds.y - headerHeight,
          width: contentBounds.width,
          height: headerHeight,
        }
      : null;
    const adjustedContentBounds = compactPlacement?.bounds ?? contentBounds;
    const left = Math.min(adjustedContentBounds.x, headerBounds?.x ?? adjustedContentBounds.x);
    const top = Math.min(adjustedContentBounds.y, headerBounds?.y ?? adjustedContentBounds.y);
    const right = Math.max(
      adjustedContentBounds.x + adjustedContentBounds.width,
      headerBounds
        ? headerBounds.x + headerBounds.width
        : adjustedContentBounds.x + adjustedContentBounds.width
    );
    const bottom = Math.max(
      adjustedContentBounds.y + adjustedContentBounds.height,
      headerBounds
        ? headerBounds.y + headerBounds.height
        : adjustedContentBounds.y + adjustedContentBounds.height
    );
    const sectionNodes = childIds.map((childId) =>
      nodes.find((node) => node.id === childId)!).filter(Boolean);
    const firstLabel = nodeLabel(sectionNodes[0], `Section ${index + 1}`);
    const lastLabel = nodeLabel(sectionNodes[sectionNodes.length - 1], firstLabel);
    const label = kind === "fold"
      ? `Fold ${index + 1} · ${sectionNodes.length > 1 ? `${firstLabel} – ${lastLabel}` : firstLabel}`
      : firstLabel;
    const movedNodeIds = new Set(childTarget.nodeIds);
    const replacedEdges = compactPlacement
      ? target.edges.filter((edge) => (
          (edge.source === parentId && movedNodeIds.has(edge.target))
          || (edge.target === parentId && movedNodeIds.has(edge.source))
        ))
      : [];
    const replacedEdgeIds = new Set(replacedEdges.map((edge) => edge.id));
    const layoutAdjustment = compactPlacement
      ? {
          translations: [{
            nodeIds: childTarget.nodeIds,
            edgeIds: childTarget.edgeIds.filter((edgeId) => !replacedEdgeIds.has(edgeId)),
            dx: compactPlacement.dx,
            dy: compactPlacement.dy,
          }],
          replacedEdgeIds: [...replacedEdgeIds],
          connectors: replacedEdges.flatMap((edge) => {
            const targetId = edge.source === parentId ? edge.target : edge.source;
            const targetNode = nodes.find((node) => node.id === targetId);
            if (!targetNode) return [];
            const targetNodeTarget = resolveExportTarget(
              { kind: "selection", nodeIds: [targetId], edgeIds: [] },
              nodes,
              edges
            );
            const originalTargetBounds = computeTightExportBounds(targetNodeTarget, {
              padding: 0,
              dom: options.dom,
            });
            const movedTargetBounds = {
              ...originalTargetBounds,
              x: originalTargetBounds.x + compactPlacement.dx,
              y: originalTargetBounds.y + compactPlacement.dy,
            };
            const data = (edge.data ?? {}) as VidyaEdgeData;
            return [{
              id: edge.id,
              path: compactConnectorPath(
                parentBounds,
                movedTargetBounds,
                compactPlacement.direction
              ),
              color: data.color ?? data.layoutColor ?? "#94a3b8",
              width: typeof data.width === "number" && Number.isFinite(data.width)
                ? Math.max(1, data.width)
                : 2,
              pathStyle: resolveConnectorPathStyle(data),
            }];
          }),
        } satisfies ExportLayoutAdjustment
      : undefined;
    return {
      id,
      index,
      kind,
      label,
      childIds,
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds,
      bounds: {
        x: left - padding,
        y: top - padding,
        width: right - left + padding * 2,
        height: bottom - top + padding * 2,
      },
      headerOverlay: headerBounds ? rootHeaderStyle(parent, headerBounds) : undefined,
      layoutAdjustment,
    };
  };

  const sections = sectionIds.map((sectionId, index) =>
    createGroup(sectionId, index, "child", [sectionId]));

  const foldChildGroups = resolvedFoldSections(parentData, sectionIds);
  const foldAnchorX = foldChildGroups.map((childIds) => {
    const anchorTarget = resolveExportTarget(
      { kind: "selection", nodeIds: [childIds[0]], edgeIds: [] },
      nodes,
      edges
    );
    return computeTightExportBounds(anchorTarget, {
      padding: 0,
      dom: options.dom,
    }).x;
  });
  const foldStride = foldAnchorX.length > 1
    ? foldAnchorX[1] - foldAnchorX[0]
    : parentBounds.width;
  const foldedHeaderWidth = foldAnchorX.length > 1
    ? parentBounds.width - foldStride * (foldAnchorX.length - 1)
    : parentBounds.width;
  const useMeasuredFoldGeometry = (
    parentIsMatrix
    && foldAnchorX.length > 1
    && Number.isFinite(foldStride)
    && foldStride > 0
    && Number.isFinite(foldedHeaderWidth)
    && foldedHeaderWidth > 0
  );
  const folds = foldChildGroups.map((childIds, index) =>
    createGroup(
      `hierarchy-fold:${parentId}:${index}`,
      index,
      "fold",
      childIds,
      useMeasuredFoldGeometry
        ? (contentBounds) => ({
            x: parentBounds.x + foldStride * index,
            y: contentBounds.y - headerHeight,
            width: foldedHeaderWidth,
            height: headerHeight,
          })
        : undefined
    ));

  return {
    parentId,
    parentLabel: nodeLabel(parent, "Parent"),
    parentIsMatrix,
    sections,
    folds,
  };
}
