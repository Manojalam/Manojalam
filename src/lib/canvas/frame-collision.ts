import type { Node } from "@xyflow/react";
import {
  createNodeRect,
  getNodeRect,
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

/**
 * Keep dropped/duplicated standalone frames fixed and push colliding neighbor
 * frames away along the gesture's primary axis. Any canvas objects owned by a
 * displaced frame receive the same translation.
 */
export function resolveFrameDropCollisions(
  nodes: readonly Node[],
  movedNodeIds: ReadonlySet<string>,
  movement: Point,
  gap = FRAME_COLLISION_GAP
): FrameCollisionPlacements {
  const movedFrames = nodes.filter((node) =>
    movedNodeIds.has(node.id) && isStandaloneFrameNode(node)
  );
  if (!movedFrames.length) return {};

  const movedBounds = combinedBounds(movedFrames.map(getNodeRect));
  const axis: "x" | "y" = Math.abs(movement.x) >= Math.abs(movement.y) ? "x" : "y";
  const axisMovement = axis === "x" ? movement.x : movement.y;
  const direction = axisMovement < 0 ? -1 : 1;
  const stationaryFrames = nodes
    .filter((node) =>
      !movedNodeIds.has(node.id)
      && isStandaloneFrameNode(node)
      && !isLocked(node)
    )
    .map((node) => ({ node, rect: getNodeRect(node) }))
    .filter(({ rect }) => overlapsCrossAxis(rect, movedBounds, axis));
  const placements: FrameCollisionPlacements = {};
  const frameDeltas = new Map<string, Point>();

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
