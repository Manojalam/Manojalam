import type { Node } from "@xyflow/react";

export type LayerOrderAction =
  | "front"
  | "forward"
  | "backward"
  | "back";

export function nodeLayer(node: Node): number {
  if (typeof node.zIndex === "number" && Number.isFinite(node.zIndex)) {
    return node.zIndex;
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  return node.type === "frame" && typeof data.matrixFrameFor !== "string" ? -1 : 0;
}

/** A normal swim lane stays behind cards even while React Flow selects it. */
export function keepsFrameBehindOnSelection(node: Node): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return node.type === "frame"
    && typeof data.matrixFrameFor !== "string"
    && nodeLayer(node) < 0;
}

function selectedLayerStart(
  nodes: readonly Node[],
  selectedIds: ReadonlySet<string>,
  action: LayerOrderAction,
  selectedCount: number
): number {
  const selectedLayers = nodes
    .filter((node) => selectedIds.has(node.id))
    .map(nodeLayer);
  const otherLayers = nodes
    .filter((node) => !selectedIds.has(node.id))
    .map(nodeLayer);
  const selectedBottom = Math.min(...selectedLayers);
  const selectedTop = Math.max(...selectedLayers);

  if (!otherLayers.length) return selectedBottom;
  if (action === "front") return Math.max(...otherLayers, selectedTop) + 1;
  if (action === "back") return Math.min(...otherLayers, selectedBottom) - selectedCount;

  if (action === "forward") {
    const nextLayer = otherLayers
      .filter((layer) => layer >= selectedTop)
      .sort((a, b) => a - b)[0];
    return nextLayer === undefined ? selectedTop + 1 : nextLayer + 1;
  }

  const previousLayer = otherLayers
    .filter((layer) => layer <= selectedBottom)
    .sort((a, b) => b - a)[0];
  return previousLayer === undefined
    ? selectedBottom - selectedCount
    : previousLayer - selectedCount;
}

/** Move the selected nodes as one stable block in the canvas stacking order. */
export function reorderSelectedNodeLayers(
  nodes: readonly Node[],
  selectedIds: ReadonlySet<string>,
  action: LayerOrderAction
): Node[] {
  const selected = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => selectedIds.has(node.id))
    .sort((first, second) =>
      nodeLayer(first.node) - nodeLayer(second.node) || first.index - second.index
    );
  if (!selected.length) return [...nodes];

  const start = selectedLayerStart(nodes, selectedIds, action, selected.length);
  const layers = new Map(selected.map(({ node }, index) => [node.id, start + index]));
  return nodes.map((node) => {
    const zIndex = layers.get(node.id);
    return zIndex === undefined ? node : { ...node, zIndex };
  });
}
