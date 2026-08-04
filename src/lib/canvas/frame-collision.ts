import type { Edge, Node } from "@xyflow/react";
import {
  createNodeRect,
  getNodeRect,
  rectsOverlap,
  type NodeRect,
  type Point,
} from "../layout/geometry";

export const FRAME_COLLISION_GAP = 32;

export type FrameCollisionPlacements = Record<string, Point>;

export function isStandaloneFrameNode(node: Node | undefined): boolean {
  if (!node || node.type !== "frame" || node.hidden) return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return typeof data.matrixFrameFor !== "string";
}

function isLocked(node: Node): boolean {
  return ((node.data ?? {}) as Record<string, unknown>).locked === true;
}

function containsCenter(frame: NodeRect, item: NodeRect): boolean {
  return item.centerX >= frame.left
    && item.centerX <= frame.right
    && item.centerY >= frame.top
    && item.centerY <= frame.bottom;
}

function normalizedCenterDistance(frame: NodeRect, item: NodeRect): number {
  const dx = (item.centerX - frame.centerX) / Math.max(1, frame.width);
  const dy = (item.centerY - frame.centerY) / Math.max(1, frame.height);
  return dx * dx + dy * dy;
}

/**
 * Assign ordinary canvas objects to the closest standalone frame containing
 * their center. This keeps cards with their swim lane while still allowing
 * cards to sit visually on top of the frame background.
 */
export function frameOwnedNodeIds(
  nodes: readonly Node[],
  ownerFrameIds: ReadonlySet<string>,
  ignoredFrameIds: ReadonlySet<string> = new Set()
): string[] {
  if (!ownerFrameIds.size) return [];
  const frames = nodes
    .filter((node) => !ignoredFrameIds.has(node.id) && isStandaloneFrameNode(node))
    .map((node) => ({
      node,
      rect: getNodeRect(node),
    }));

  return nodes.flatMap((node) => {
    if (node.hidden || node.type === "frame") return [];
    const itemRect = getNodeRect(node);
    const owner = frames
      .filter(({ rect }) => containsCenter(rect, itemRect))
      .sort((first, second) => {
        const areaDelta = first.rect.width * first.rect.height
          - second.rect.width * second.rect.height;
        if (Math.abs(areaDelta) > 0.5) return areaDelta;
        return normalizedCenterDistance(first.rect, itemRect)
          - normalizedCenterDistance(second.rect, itemRect);
      })[0]?.node.id;
    return owner && ownerFrameIds.has(owner) ? [node.id] : [];
  });
}

function combinedBounds(rects: readonly NodeRect[]): NodeRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return createNodeRect("moved-frames", left, top, right - left, bottom - top);
}

function overlapsCrossAxis(
  rect: NodeRect,
  movedBounds: NodeRect,
  axis: "x" | "y"
): boolean {
  return axis === "x"
    ? rect.top < movedBounds.bottom && rect.bottom > movedBounds.top
    : rect.left < movedBounds.right && rect.right > movedBounds.left;
}

/** Frames are visual containers, not relationship or hierarchy endpoints. */
export function edgesWithoutStandaloneFrameEndpoints(
  nodes: readonly Node[],
  edges: readonly Edge[]
): Edge[] {
  const frameIds = new Set(nodes.filter(isStandaloneFrameNode).map((node) => node.id));
  if (!frameIds.size) return [...edges];
  return edges.filter((edge) => !frameIds.has(edge.source) && !frameIds.has(edge.target));
}

/** Remove hierarchy metadata left behind by an invalid Frame connector. */
export function nodesWithoutStandaloneFrameHierarchy(nodes: readonly Node[]): Node[] {
  const frameIds = new Set(nodes.filter(isStandaloneFrameNode).map((node) => node.id));
  if (!frameIds.size) return [...nodes];
  return nodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const parentId = typeof data.parentId === "string" ? data.parentId : null;
    const originalChildOrder = Array.isArray(data.childOrder)
      ? data.childOrder as unknown[]
      : undefined;
    const childOrder = originalChildOrder
      ? frameIds.has(node.id)
        ? []
        : originalChildOrder.filter((id): id is string =>
            typeof id === "string" && !frameIds.has(id)
          )
      : undefined;
    const nextParentId = frameIds.has(node.id) || (parentId && frameIds.has(parentId))
      ? null
      : parentId;
    if (
      nextParentId === parentId
      && (childOrder === undefined || childOrder.length === originalChildOrder?.length)
    ) return node;
    return {
      ...node,
      data: {
        ...data,
        parentId: nextParentId,
        ...(childOrder ? { childOrder } : {}),
      },
    };
  });
}

function overlapsMainAxisWithGap(
  rect: NodeRect,
  movedBounds: NodeRect,
  axis: "x" | "y",
  gap: number
): boolean {
  return axis === "x"
    ? rect.left < movedBounds.right + gap && rect.right + gap > movedBounds.left
    : rect.top < movedBounds.bottom + gap && rect.bottom + gap > movedBounds.top;
}

function mainAxisCenterDistance(
  rect: NodeRect,
  movedBounds: NodeRect,
  axis: "x" | "y"
): number {
  return axis === "x"
    ? Math.abs(rect.centerX - movedBounds.centerX)
    : Math.abs(rect.centerY - movedBounds.centerY);
}

/**
 * Keep dropped/duplicated standalone frames fixed and push colliding neighbor
 * frames away along the gesture's primary axis. Any canvas objects owned by a
 * displaced frame receive the same translation.
 */
export function resolveFrameDropCollisions(
  nodes: readonly Node[],
  movedNodeIds: ReadonlySet<string>,
  movement: Point,
  dropPoint?: Point,
  gap = FRAME_COLLISION_GAP
): FrameCollisionPlacements {
  const movedFrames = nodes.filter((node) =>
    movedNodeIds.has(node.id) && isStandaloneFrameNode(node)
  );
  if (!movedFrames.length) return {};

  let movedBounds = combinedBounds(movedFrames.map(getNodeRect));
  const allStationaryFrames = nodes
    .filter((node) =>
      !movedNodeIds.has(node.id)
      && isStandaloneFrameNode(node)
      && !isLocked(node)
    )
    .map((node) => ({ node, rect: getNodeRect(node) }));
  const placements: FrameCollisionPlacements = {};
  const frameDeltas = new Map<string, Point>();

  const directCollisionAnchor = allStationaryFrames
    .filter(({ rect }) => rectsOverlap(rect, movedBounds, gap))
    .sort((first, second) => {
      const reference = dropPoint ?? {
        x: movedBounds.centerX,
        y: movedBounds.centerY,
      };
      return Math.hypot(
        first.rect.centerX - reference.x,
        first.rect.centerY - reference.y
      ) - Math.hypot(
        second.rect.centerX - reference.x,
        second.rect.centerY - reference.y
      );
    })[0]?.rect;
  const pointerIntent = dropPoint && directCollisionAnchor
    ? {
        x: dropPoint.x - directCollisionAnchor.centerX,
        y: dropPoint.y - directCollisionAnchor.centerY,
      }
    : movement;
  const intent = Math.hypot(pointerIntent.x, pointerIntent.y) >= 8
    ? pointerIntent
    : movement;
  const axis: "x" | "y" = Math.abs(intent.x) >= Math.abs(intent.y) ? "x" : "y";
  const axisMovement = axis === "x" ? intent.x : intent.y;
  const direction = axisMovement < 0 ? -1 : 1;

  // Use the pointer's location around the collided frame to choose the side,
  // then align the dropped group on the cross axis before making room there.
  const alignmentAnchor = directCollisionAnchor ?? allStationaryFrames
    .filter(({ rect }) => overlapsCrossAxis(rect, movedBounds, axis))
    .filter(({ rect }) => overlapsMainAxisWithGap(rect, movedBounds, axis, gap))
    .sort((first, second) =>
      mainAxisCenterDistance(first.rect, movedBounds, axis)
      - mainAxisCenterDistance(second.rect, movedBounds, axis)
    )[0]?.rect;
  const crossDelta = alignmentAnchor
    ? axis === "x"
      ? { x: 0, y: alignmentAnchor.top - movedBounds.top }
      : { x: alignmentAnchor.left - movedBounds.left, y: 0 }
    : { x: 0, y: 0 };
  if (Math.abs(crossDelta.x) >= 0.5 || Math.abs(crossDelta.y) >= 0.5) {
    for (const node of nodes) {
      if (!movedNodeIds.has(node.id)) continue;
      placements[node.id] = {
        x: node.position.x + crossDelta.x,
        y: node.position.y + crossDelta.y,
      };
    }
    movedBounds = createNodeRect(
      movedBounds.id,
      movedBounds.left + crossDelta.x,
      movedBounds.top + crossDelta.y,
      movedBounds.width,
      movedBounds.height
    );
  }

  const stationaryFrames = allStationaryFrames
    .filter(({ rect }) => overlapsCrossAxis(rect, movedBounds, axis));

  if (axis === "x" && direction > 0) {
    let cursor = movedBounds.right + gap;
    const candidates = stationaryFrames
      .filter(({ rect }) =>
        rect.centerX >= movedBounds.centerX
        && rect.right + gap > movedBounds.left
      )
      .sort((first, second) => first.rect.left - second.rect.left);
    for (const { node, rect } of candidates) {
      if (rect.left >= cursor) break;
      const dx = cursor - rect.left;
      placements[node.id] = { x: node.position.x + dx, y: node.position.y };
      frameDeltas.set(node.id, { x: dx, y: 0 });
      cursor = rect.right + dx + gap;
    }
  } else if (axis === "x") {
    let cursor = movedBounds.left - gap;
    const candidates = stationaryFrames
      .filter(({ rect }) =>
        rect.centerX <= movedBounds.centerX
        && rect.left - gap < movedBounds.right
      )
      .sort((first, second) => second.rect.right - first.rect.right);
    for (const { node, rect } of candidates) {
      if (rect.right <= cursor) break;
      const dx = cursor - rect.right;
      placements[node.id] = { x: node.position.x + dx, y: node.position.y };
      frameDeltas.set(node.id, { x: dx, y: 0 });
      cursor = rect.left + dx - gap;
    }
  } else if (direction > 0) {
    let cursor = movedBounds.bottom + gap;
    const candidates = stationaryFrames
      .filter(({ rect }) =>
        rect.centerY >= movedBounds.centerY
        && rect.bottom + gap > movedBounds.top
      )
      .sort((first, second) => first.rect.top - second.rect.top);
    for (const { node, rect } of candidates) {
      if (rect.top >= cursor) break;
      const dy = cursor - rect.top;
      placements[node.id] = { x: node.position.x, y: node.position.y + dy };
      frameDeltas.set(node.id, { x: 0, y: dy });
      cursor = rect.bottom + dy + gap;
    }
  } else {
    let cursor = movedBounds.top - gap;
    const candidates = stationaryFrames
      .filter(({ rect }) =>
        rect.centerY <= movedBounds.centerY
        && rect.top - gap < movedBounds.bottom
      )
      .sort((first, second) => second.rect.bottom - first.rect.bottom);
    for (const { node, rect } of candidates) {
      if (rect.bottom <= cursor) break;
      const dy = cursor - rect.bottom;
      placements[node.id] = { x: node.position.x, y: node.position.y + dy };
      frameDeltas.set(node.id, { x: 0, y: dy });
      cursor = rect.top + dy - gap;
    }
  }

  if (!frameDeltas.size) return placements;
  const displacedFrameIds = new Set(frameDeltas.keys());
  const ownedIds = new Set(frameOwnedNodeIds(nodes, displacedFrameIds, movedNodeIds));
  for (const node of nodes) {
    if (!ownedIds.has(node.id) || movedNodeIds.has(node.id)) continue;
    const owner = stationaryFrames
      .filter(({ node: frame }) => displacedFrameIds.has(frame.id))
      .filter(({ rect }) => containsCenter(rect, getNodeRect(node)))
      .sort((first, second) => normalizedCenterDistance(first.rect, getNodeRect(node))
        - normalizedCenterDistance(second.rect, getNodeRect(node)))[0]?.node.id;
    const delta = owner ? frameDeltas.get(owner) : undefined;
    if (!delta) continue;
    placements[node.id] = {
      x: node.position.x + delta.x,
      y: node.position.y + delta.y,
    };
  }

  return placements;
}
