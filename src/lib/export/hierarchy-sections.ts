import type { Edge, Node } from "@xyflow/react";

import { resolvedFoldSections } from "../layout/child-group-wrap";
import { buildHierarchy } from "../layout/hierarchy";
import { matrixCellBorderRadius } from "../layout/matrix-presentation";
import {
  computeTightExportBounds,
  resolveExportTarget,
  type ExportDomBoundsContext,
} from "./bounds";
import type { ExportHeaderOverlay } from "./dom-renderer";
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
    if (!parentIsMatrix) includedNodeIds.add(parentId);
    return resolveExportTarget(
      { kind: "selection", nodeIds: [...includedNodeIds], edgeIds: [] },
      nodes,
      edges
    );
  };

  const createGroup = (
    id: string,
    index: number,
    kind: HierarchySectionExport["kind"],
    childIds: string[],
    headerBoundsForContent?: (contentBounds: ExportBounds) => ExportBounds
  ): HierarchySectionExport => {
    const target = targetForChildren(childIds);
    const contentBounds = computeTightExportBounds(target, {
      padding: 0,
      dom: options.dom,
    });
    const headerBounds = parentIsMatrix
      ? headerBoundsForContent?.(contentBounds) ?? {
          x: contentBounds.x,
          y: contentBounds.y - headerHeight,
          width: contentBounds.width,
          height: headerHeight,
        }
      : null;
    const left = Math.min(contentBounds.x, headerBounds?.x ?? contentBounds.x);
    const top = Math.min(contentBounds.y, headerBounds?.y ?? contentBounds.y);
    const right = Math.max(
      contentBounds.x + contentBounds.width,
      headerBounds ? headerBounds.x + headerBounds.width : contentBounds.x + contentBounds.width
    );
    const bottom = Math.max(
      contentBounds.y + contentBounds.height,
      headerBounds ? headerBounds.y + headerBounds.height : contentBounds.y + contentBounds.height
    );
    const sectionNodes = childIds.map((childId) =>
      nodes.find((node) => node.id === childId)!).filter(Boolean);
    const firstLabel = nodeLabel(sectionNodes[0], `Section ${index + 1}`);
    const lastLabel = nodeLabel(sectionNodes[sectionNodes.length - 1], firstLabel);
    const label = kind === "fold"
      ? `Fold ${index + 1} · ${sectionNodes.length > 1 ? `${firstLabel} – ${lastLabel}` : firstLabel}`
      : firstLabel;
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
