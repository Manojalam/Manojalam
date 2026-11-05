"use client";

import { useCanvasStore } from "@/store/canvas-store";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import { buildMatrixLeafRows } from "@/lib/layout/matrix-layout";
import { FoldBranchControls } from "./FoldBranchControls";

/** Matrix-wide folding is available from any cell, including multi-selection. */
export function MatrixFoldPanel() {
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const ids = useCanvasStore(state => state.selectedNodeIds);
  const layers = useCanvasStore(state => state.layers);
  const viewer = useCanvasStore(state => state.board?.accessRole === "viewer");
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const roots = ids.map(id => {
    const seen = new Set<string>();
    let node = byId.get(id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      if (node.data.layoutMode === "matrix") return node;
      const root = typeof node.data.matrixRootId === "string" ? byId.get(node.data.matrixRootId) : undefined;
      if (root?.data.layoutMode === "matrix") return root;
      node = byId.get(hierarchy.get(node.id)?.parentId ?? "");
    }
    return undefined;
  });
  const root = roots[0];
  if (!root || roots.some(item => item?.id !== root.id)) return <section aria-label="Fold matrix" className="border-b p-3 text-xs">Select cells within one matrix to change its folds.</section>;
  const rows = buildMatrixLeafRows(root.id, hierarchy, byId).flatMap(row => row.path.at(-1) ?? []);
  const locked = viewer || root.data.locked === true || layers.some(layer => layer.id === root.data.layerId && layer.locked);
  return <section aria-label="Fold matrix" className="space-y-2 border-b p-3">
    <h3 className="text-xs font-semibold">Fold matrix</h3>
    <p className="text-[10px] text-muted-foreground">Applies to the whole matrix, regardless of which cell is selected.</p>
    {rows.length > 1 ? <fieldset disabled={locked} className="min-w-0 disabled:opacity-50">
      <FoldBranchControls parentId={root.id} parentData={root.data} childIds={rows} hierarchy={hierarchy} nodes={nodes} terminalItems compact />
    </fieldset> : <p className="text-xs text-muted-foreground">Add at least two rows to fold this matrix into sections.</p>}
  </section>;
}
