import type { Edge, Node } from "@xyflow/react";

import { buildHierarchy } from "../layout/hierarchy";
import { matrixCellBorderRadius } from "../layout/matrix-presentation";
import {
  computeTightExportBounds,
  resolveExportTarget,
  type ExportDomBoundsContext,
} from "./bounds";
import type { ExportHeaderOverlay } from "./dom-renderer";
import type { ExportBounds } from "./types";

export interface MatrixSectionExport {
  id: string;
  index: number;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
  bounds: ExportBounds;
  headerOverlay: ExportHeaderOverlay;
}

export interface MatrixSectionExportPlan {
  rootId: string;
  rootLabel: string;
  sections: MatrixSectionExport[];
}

export interface MatrixSectionExportPlanOptions {
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

function nodeLabel(node: Node, fallback: string): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
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

export function resolveMatrixSectionExportPlan(
  rootId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
  options: MatrixSectionExportPlanOptions = {}
): MatrixSectionExportPlan | null {
  const root = nodes.find((node) => node.id === rootId && node.hidden !== true);
  const rootData = (root?.data ?? {}) as Record<string, unknown>;
  if (!root || rootData.layoutMode !== "matrix") return null;

  const padding = options.padding ?? 0;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("Matrix section export padding must be a finite non-negative number.");
  }

  const hierarchy = buildHierarchy([...nodes], [...edges]);
  const sectionIds = (hierarchy.get(rootId)?.childIds ?? []).filter((nodeId) =>
    nodes.some((node) => node.id === nodeId && node.hidden !== true));
  if (sectionIds.length === 0) return null;

  const rootTarget = resolveExportTarget(
    { kind: "selection", nodeIds: [rootId], edgeIds: [] },
    nodes,
    edges
  );
  const rootBounds = computeTightExportBounds(rootTarget, {
    padding: 0,
    dom: options.dom,
  });
  const headerHeight = Math.max(1, rootBounds.height);

  const sections = sectionIds.map((sectionId, index): MatrixSectionExport => {
    const target = resolveExportTarget(
      { kind: "subtree", rootId: sectionId },
      nodes,
      edges
    );
    const contentBounds = computeTightExportBounds(target, {
      padding: 0,
      dom: options.dom,
    });
    const headerBounds = {
      x: contentBounds.x,
      y: contentBounds.y - headerHeight,
      width: contentBounds.width,
      height: headerHeight,
    };
    const sectionNode = nodes.find((node) => node.id === sectionId)!;
    return {
      id: sectionId,
      index,
      label: nodeLabel(sectionNode, `Section ${index + 1}`),
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds,
      bounds: {
        x: contentBounds.x - padding,
        y: headerBounds.y - padding,
        width: contentBounds.width + padding * 2,
        height: headerHeight + contentBounds.height + padding * 2,
      },
      headerOverlay: rootHeaderStyle(root, headerBounds),
    };
  });

  return {
    rootId,
    rootLabel: nodeLabel(root, "Matrix"),
    sections,
  };
}
