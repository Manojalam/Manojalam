import type { Edge, Node } from "@xyflow/react";

type SemanticToken = Readonly<Record<never, never>>;

const nodeTokenCache = new WeakMap<readonly Node[], SemanticToken>();
const edgeTokenCache = new WeakMap<readonly Edge[], SemanticToken>();

let latestNodes: readonly Node[] | null = null;
let latestNodeToken: SemanticToken = {};
let latestEdges: readonly Edge[] | null = null;
let latestEdgeToken: SemanticToken = {};

function sameNodeContent(first: readonly Node[], second: readonly Node[]): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    const left = first[index];
    const right = second[index];
    if (
      left.id !== right.id
      || left.type !== right.type
      || left.data !== right.data
    ) return false;
  }
  return true;
}

function sameHierarchyEdges(first: readonly Edge[], second: readonly Edge[]): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    const left = first[index];
    const right = second[index];
    if (
      left.id !== right.id
      || left.source !== right.source
      || left.target !== right.target
    ) return false;
  }
  return true;
}

/**
 * Returns a stable identity while only transient React Flow node fields change.
 * Chart renderers consume node data and hierarchy identity, but not per-frame
 * position, selection, measured-size, or dragging fields.
 */
export function chartNodeContentToken(nodes: readonly Node[]): SemanticToken {
  const cached = nodeTokenCache.get(nodes);
  if (cached) return cached;

  const token = latestNodes && sameNodeContent(latestNodes, nodes)
    ? latestNodeToken
    : {};
  nodeTokenCache.set(nodes, token);
  latestNodes = nodes;
  latestNodeToken = token;
  return token;
}

/**
 * Returns a stable identity while edge selection, routing handles, or styling
 * changes. Diagrams only use edge ids and endpoints to build their hierarchy.
 */
export function chartHierarchyEdgeToken(edges: readonly Edge[]): SemanticToken {
  const cached = edgeTokenCache.get(edges);
  if (cached) return cached;

  const token = latestEdges && sameHierarchyEdges(latestEdges, edges)
    ? latestEdgeToken
    : {};
  edgeTokenCache.set(edges, token);
  latestEdges = edges;
  latestEdgeToken = token;
  return token;
}
