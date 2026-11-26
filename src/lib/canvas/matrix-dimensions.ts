import type { Node } from "@xyflow/react";
import { getNodeDimensions, getNodeRect } from "../layout/geometry";
import { getSubtree, type Hierarchy } from "../layout/hierarchy";

const layoutKeys = [
  "matrixDensity", "matrixDensityUserSet", "matrixCompositionMode",
  "matrixOrientation", "matrixChildFlow", "matrixLevelLayouts",
  "matrixPackCompactGroups", "matrixIncompleteRowMode", "matrixSiblingGap",
  "layoutFoldCount", "layoutWrapAfter", "matrixFoldRootMode",
] as const;

export type MatrixDimensions = {
  width: number;
  height: number;
  cells: { children: number; width: number; height: number; layout: Record<string, unknown>; breaks?: number[] }[];
};

export function copyMatrixDimensions(rootId: string, hierarchy: Hierarchy, nodes: Node[]): MatrixDimensions {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ids = getSubtree(rootId, hierarchy);
  const branch = ids.map(id => byId.get(id)!);
  const rects = branch.filter(node => !node.hidden).map(getNodeRect);
  return {
    width: Math.max(...rects.map(rect => rect.right)) - Math.min(...rects.map(rect => rect.left)),
    height: Math.max(...rects.map(rect => rect.bottom)) - Math.min(...rects.map(rect => rect.top)),
    cells: branch.map(node => ({
      children: hierarchy.get(node.id)?.childIds.length ?? 0,
      ...getNodeDimensions(node),
      layout: Object.fromEntries(layoutKeys.map(key => [key, structuredClone(node.data[key])])),
      breaks: Array.isArray(node.data.layoutFoldBreakAfter)
        ? node.data.layoutFoldBreakAfter.map(id => ids.indexOf(String(id))).filter(index => index >= 0)
        : undefined,
    })),
  };
}

/** Apply atomically: per-cell store updates would release ancestor/table constraints. */
export function applyMatrixDimensions(snapshot: MatrixDimensions, rootId: string, hierarchy: Hierarchy, nodes: Node[]): Node[] | null {
  const ids = getSubtree(rootId, hierarchy);
  if (ids.length !== snapshot.cells.length || ids.some((id, index) =>
    (hierarchy.get(id)?.childIds.length ?? 0) !== snapshot.cells[index].children
  )) return null;
  const patches = new Map(ids.map((id, index) => {
    const cell = snapshot.cells[index];
    return [id, {
      ...cell.layout,
      layoutFoldBreakAfter: cell.breaks?.map(offset => ids[offset]),
      matrixWidthOverride: cell.width,
      matrixHeightOverride: cell.height,
      ...(id === rootId ? {
        matrixTableWidthOverride: snapshot.width,
        matrixTableHeightOverride: snapshot.height,
        matrixTableSizeLocked: true,
      } : {}),
    }];
  }));
  return nodes.map(node => patches.has(node.id)
    ? { ...node, data: { ...node.data, ...patches.get(node.id) } }
    : node);
}

/** Whole-matrix Auto releases both the outer constraint and every cell on that axis. */
export function resetMatrixDimensions(rootId: string, hierarchy: Hierarchy, nodes: Node[], axis: "width" | "height"): Node[] {
  const ids = new Set(getSubtree(rootId, hierarchy));
  const field = axis === "width" ? "matrixWidthOverride" : "matrixHeightOverride";
  const tableField = axis === "width" ? "matrixTableWidthOverride" : "matrixTableHeightOverride";
  return nodes.map(node => ids.has(node.id) ? {
    ...node,
    data: {
      ...node.data,
      [field]: undefined,
      ...(node.id === rootId ? { [tableField]: undefined, matrixTableSizeLocked: undefined } : {}),
    },
  } : node);
}
