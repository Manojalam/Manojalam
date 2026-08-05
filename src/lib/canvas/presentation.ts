import type { Edge, Node } from "@xyflow/react";
import { frameOwnedNodeIds, isStandaloneFrameNode } from "./frame-collision";
import { buildHierarchy, getRoots, getSubtree } from "../layout/hierarchy";
import { getNodeRect, nodePositionFromTopLeft } from "../layout/geometry";

export type PresentationStopKind = "overview" | "frame" | "chart" | "branch" | "matrix-fold";
export type PresentationOrder = "rows" | "columns";

export interface MatrixFoldPresentation {
  rootId: string;
  bodyFrameId: string;
  /** A continuous header spans every fold on the board and is localized while presenting. */
  localizeContinuousHeader: boolean;
}

export interface PresentationStop {
  id: string;
  kind: PresentationStopKind;
  title: string;
  nodeIds: string[];
  matrixFold?: MatrixFoldPresentation;
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

function uniqueNodeIds(nodeIds: readonly string[]): string[] {
  return [...new Set(nodeIds)];
}

function matrixFoldPresentationStops(
  root: Node,
  nodes: readonly Node[],
  order: PresentationOrder
): PresentationStop[] | null {
  const rootData = (root.data ?? {}) as Record<string, unknown>;
  if (rootData.layoutMode !== "matrix") return null;
  const sections = Array.isArray(rootData.matrixFoldSections)
    ? rootData.matrixFoldSections
    : [];
  if (sections.length < 2) return null;

  const sectionFrames = nodes.filter((node) => {
    if (node.hidden || node.type !== "frame") return false;
    const data = (node.data ?? {}) as Record<string, unknown>;
    return data.matrixFrameFor === root.id
      && typeof data.matrixFoldSectionIndex === "number";
  });
  const dividedRoot = rootData.matrixFoldRootMode === "divided";
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const stops = sections.map((_section, sectionIndex): PresentationStop | null => {
    const frames = sectionFrames.filter((frame) =>
      (frame.data as Record<string, unknown>).matrixFoldSectionIndex === sectionIndex);
    const bodyFrame = frames.find((frame) =>
      Array.isArray((frame.data as Record<string, unknown>).matrixFoldSectionNodeIds));
    if (!bodyFrame) return null;
    const bodyData = (bodyFrame.data ?? {}) as Record<string, unknown>;
    const authoredNodeIds = (bodyData.matrixFoldSectionNodeIds as unknown[])
      .filter((nodeId): nodeId is string =>
        typeof nodeId === "string" && nodeById.get(nodeId)?.hidden !== true);
    const sectionRoots = orderPresentationNodes(authoredNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is Node =>
        node !== undefined
        && (node.data as Record<string, unknown>)?.parentId === root.id), order);
    const firstTitle = presentationNodeTitle(sectionRoots[0], `Fold ${sectionIndex + 1}`);
    const lastTitle = presentationNodeTitle(sectionRoots.at(-1), firstTitle);
    const sectionTitle = sectionRoots.length > 1
      ? `${firstTitle} – ${lastTitle}`
      : firstTitle;
    const localizeContinuousHeader = !dividedRoot;
    return {
      id: `matrix-fold:${root.id}:${sectionIndex}`,
      kind: "matrix-fold",
      title: `Fold ${sectionIndex + 1} · ${sectionTitle}`,
      nodeIds: uniqueNodeIds([
        ...frames.map((frame) => frame.id),
        ...authoredNodeIds,
        ...(localizeContinuousHeader ? [root.id] : []),
      ]),
      matrixFold: {
        rootId: root.id,
        bodyFrameId: bodyFrame.id,
        localizeContinuousHeader,
      },
    };
  });
  return stops.every((stop): stop is PresentationStop => stop !== null)
    ? stops
    : null;
}

/**
 * Fold sections reuse a wide root header on the board. While teaching one fold,
 * clone that root geometry above the active body so viewport fitting does not
 * include every folded section. The saved board nodes are never mutated.
 */
export function applyPresentationStopGeometry(
  nodes: readonly Node[],
  stop: PresentationStop | undefined
): Node[] {
  const fold = stop?.matrixFold;
  if (!fold?.localizeContinuousHeader) return [...nodes];
  const root = nodes.find((node) => node.id === fold.rootId);
  const bodyFrame = nodes.find((node) => node.id === fold.bodyFrameId);
  if (!root || !bodyFrame) return [...nodes];
  const rootRect = getNodeRect(root);
  const bodyRect = getNodeRect(bodyFrame);
  const size = { width: bodyRect.width, height: rootRect.height };
  return nodes.map((node) => node.id !== root.id ? node : {
    ...node,
    position: nodePositionFromTopLeft(node, {
      x: bodyRect.left,
      y: bodyRect.top - rootRect.height,
    }, size),
    width: undefined,
    height: undefined,
    measured: undefined,
    style: {
      ...(node.style ?? {}),
      width: size.width,
      height: size.height,
    },
  });
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
  const matrixFoldStopsByRoot = new Map<string, PresentationStop[]>();
  for (const node of visibleNodes) {
    if (node.type === "frame") continue;
    const foldStops = matrixFoldPresentationStops(node, visibleNodes, order);
    if (foldStops) matrixFoldStopsByRoot.set(node.id, foldStops);
  }

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

    const matrixFoldStops = [...matrixFoldStopsByRoot.values()].flat();
    return additionalIds.length
      ? [overview, ...frameStops, ...matrixFoldStops, {
          id: "additional-ideas",
          kind: "chart",
          title: "Additional ideas",
          nodeIds: additionalIds,
        }]
      : [overview, ...frameStops, ...matrixFoldStops];
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
  const presentedMatrixRootIds = new Set<string>();

  roots.forEach((root, rootIndex) => {
    const matrixFolds = matrixFoldStopsByRoot.get(root.id);
    if (matrixFolds) {
      presentedMatrixRootIds.add(root.id);
      stops.push(...matrixFolds);
      return;
    }
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

  for (const [rootId, matrixFolds] of matrixFoldStopsByRoot) {
    if (!presentedMatrixRootIds.has(rootId)) stops.push(...matrixFolds);
  }

  return stops;
}
