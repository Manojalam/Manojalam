import type { Edge, Node } from "@xyflow/react";
import { frameOwnedNodeIds, isStandaloneFrameNode } from "./frame-collision";
import { buildHierarchy, getRoots, getSubtree } from "../layout/hierarchy";
import { getNodeRect } from "../layout/geometry";

export type PresentationStopKind = "overview" | "frame" | "chart" | "branch";
export type PresentationOrder = "rows" | "columns";

export interface PresentationStop {
  id: string;
  kind: PresentationStopKind;
  title: string;
  nodeIds: string[];
}

function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function presentationNodeTitle(node: Node | undefined, fallback: string): string {
  if (!node) return fallback;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const title = [
    data.title,
    data.text,
    data.label,
    data.centerText,
    data.devanagari,
    data.translation,
  ].map(plainText).find(Boolean);
  if (!title) return fallback;
  return title.length > 54 ? `${title.slice(0, 51).trimEnd()}…` : title;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Arrange objects in visual bands, tolerating the small alignment differences
 * common on a free-form canvas. Pairwise comparators are not sufficient here:
 * they can split one slightly uneven row into several apparent columns.
 */
export function orderPresentationNodes(
  nodes: readonly Node[],
  order: PresentationOrder
): Node[] {
  if (nodes.length < 2) return [...nodes];
  const items = nodes.map((node) => {
    const rect = getNodeRect(node);
    return {
      node,
      primary: order === "rows" ? rect.centerY : rect.centerX,
      secondary: order === "rows" ? rect.centerX : rect.centerY,
      primarySize: order === "rows" ? rect.height : rect.width,
    };
  });
  const bandTolerance = Math.max(
    32,
    Math.min(180, median(items.map((item) => item.primarySize)) * 0.75)
  );
  items.sort((first, second) => first.primary - second.primary || first.secondary - second.secondary);

  const bands: Array<{ center: number; items: typeof items }> = [];
  for (const item of items) {
    const band = bands[bands.length - 1];
    if (!band || Math.abs(item.primary - band.center) > bandTolerance) {
      bands.push({ center: item.primary, items: [item] });
      continue;
    }
    band.items.push(item);
    band.center = band.items.reduce((sum, current) => sum + current.primary, 0) / band.items.length;
  }

  return bands.flatMap((band) =>
    band.items.sort((first, second) => first.secondary - second.secondary).map((item) => item.node)
  );
}

/**
 * Turn an existing board into a useful teaching sequence without asking the
 * author to maintain a second slide model. Authored frames become sections;
 * otherwise each hierarchy root becomes a chart stop followed by its main
 * branches. The first stop is always a safe whole-board overview.
 */
export function buildPresentationStops(
  nodes: readonly Node[],
  edges: readonly Edge[],
  order: PresentationOrder = "rows"
): PresentationStop[] {
  const visibleNodes = nodes.filter((node) => !node.hidden);
  if (!visibleNodes.length) return [];

  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const overview: PresentationStop = {
    id: "overview",
    kind: "overview",
    title: "Board overview",
    nodeIds: visibleNodes.map((node) => node.id),
  };

  const frames = orderPresentationNodes(visibleNodes.filter(isStandaloneFrameNode), order);
  if (frames.length) {
    const frameIds = new Set(frames.map((frame) => frame.id));
    const ownedIds = frameOwnedNodeIds(nodes, frameIds);
    const ownerByNodeId = new Map<string, string>();

    for (const frame of frames) {
      const ownedByThisFrame = frameOwnedNodeIds(nodes, new Set([frame.id]));
      ownedByThisFrame.forEach((nodeId) => ownerByNodeId.set(nodeId, frame.id));
    }

    const frameStops = frames.map((frame, index): PresentationStop => ({
      id: `frame:${frame.id}`,
      kind: "frame",
      title: presentationNodeTitle(frame, `Section ${index + 1}`),
      nodeIds: [
        frame.id,
        ...ownedIds.filter((nodeId) => ownerByNodeId.get(nodeId) === frame.id),
      ],
    }));

    const presentedIds = new Set([...frameIds, ...ownedIds]);
    const additionalIds = visibleNodes
      .filter((node) => !presentedIds.has(node.id) && node.type !== "frame")
      .map((node) => node.id);

    return additionalIds.length
      ? [overview, ...frameStops, {
          id: "additional-ideas",
          kind: "chart",
          title: "Additional ideas",
          nodeIds: additionalIds,
        }]
      : [overview, ...frameStops];
  }

  const hierarchy = buildHierarchy(
    visibleNodes,
    edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  );
  const byId = new Map(visibleNodes.map((node) => [node.id, node]));
  const roots = orderPresentationNodes(getRoots(hierarchy)
    .map((id) => byId.get(id))
    .filter((node): node is Node => Boolean(node) && node?.type !== "frame"), order);
  const stops: PresentationStop[] = [overview];

  roots.forEach((root, rootIndex) => {
    const rootSubtree = getSubtree(root.id, hierarchy).filter((id) => visibleIds.has(id));
    stops.push({
      id: `chart:${root.id}`,
      kind: "chart",
      title: presentationNodeTitle(root, `Topic ${rootIndex + 1}`),
      nodeIds: rootSubtree,
    });

    const children = orderPresentationNodes((hierarchy.get(root.id)?.childIds ?? [])
      .map((id) => byId.get(id))
      .filter((node): node is Node => Boolean(node)), order);
    if (children.length < 2) return;

    children.forEach((child, childIndex) => {
      stops.push({
        id: `branch:${root.id}:${child.id}`,
        kind: "branch",
        title: presentationNodeTitle(child, `Idea ${childIndex + 1}`),
        nodeIds: [root.id, ...getSubtree(child.id, hierarchy).filter((id) => visibleIds.has(id))],
      });
    });
  });

  return stops;
}
