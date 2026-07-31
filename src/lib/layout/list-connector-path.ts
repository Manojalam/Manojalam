import type { OrthogonalSegment } from "./geometry";

function segmentPath(segment: OrthogonalSegment): string {
  return `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`;
}

function hardSegmentPath(segments: readonly OrthogonalSegment[]): string {
  return segments.map(segmentPath).join(" ");
}

/**
 * Joins a List parent's bottom anchor to its shared child trunk without the
 * small rectangular dogleg produced by separate vertical/horizontal segments.
 */
export function smoothListSharedPath(segments: readonly OrthogonalSegment[]): string {
  if (segments.length !== 3) return hardSegmentPath(segments);

  const [drop, bridge, trunk] = segments;
  const isListSharedTrunk = drop.x1 === drop.x2
    && bridge.y1 === bridge.y2
    && trunk.x1 === trunk.x2
    && drop.x2 === bridge.x1
    && drop.y2 === bridge.y1
    && bridge.x2 === trunk.x1
    && bridge.y2 === trunk.y1;
  if (!isListSharedTrunk) return hardSegmentPath(segments);

  if (drop.x1 === trunk.x1) {
    return `M ${drop.x1} ${drop.y1} L ${trunk.x2} ${trunk.y2}`;
  }

  const transitionMidY = drop.y1 + (trunk.y1 - drop.y1) / 2;
  return [
    `M ${drop.x1} ${drop.y1}`,
    `C ${drop.x1} ${transitionMidY} ${trunk.x1} ${transitionMidY} ${trunk.x1} ${trunk.y1}`,
    `L ${trunk.x2} ${trunk.y2}`,
  ].join(" ");
}
