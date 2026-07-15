import {
  buildFlowerPetalGeometry,
  flowerPetalGeometryBounds,
  type FlowerPetalBounds,
  type FlowerPetalGeometryInput,
  type FlowerPetalPoint,
} from "./flower-petal-geometry";

export type RelationshipFlowerDensity = "compact" | "comfortable" | "spacious";

export interface RelationshipFlowerPetalInput {
  /** Optional one-based manual layer assignment. */
  preferredLayer?: number;
}

export interface RelationshipFlowerLayoutOptions {
  hubRadius: number;
  maxPerLayer: number;
  density: RelationshipFlowerDensity;
  /** Zero means automatic; otherwise forces this many concentric layers. */
  layerCount?: number;
}

export interface RelationshipFlowerPetalPlacement {
  index: number;
  layerIndex: number;
  slotIndex: number;
  angle: number;
  rootRadius: number;
  length: number;
  halfWidth: number;
  labelCenterRadius: number;
  labelRegionRadius: number;
  /** Half of this petal's collision-free angular sector. */
  sectorHalfAngleDegrees: number;
  /** Perpendicular inset from both sector edges, in canvas units. */
  edgeClearance: number;
}

export interface RelationshipFlowerLayout {
  petals: RelationshipFlowerPetalPlacement[];
  layerCounts: number[];
  length: number;
  halfWidth: number;
  labelCenterOffset: number;
  labelRegionRadius: number;
  maximumExtent: number;
}

export const MIN_FLOWER_PETALS_PER_LAYER = 3;
export const MAX_FLOWER_PETALS_PER_LAYER = 24;
export const DEFAULT_FLOWER_PETALS_PER_LAYER = 9;
export const MAX_FLOWER_LAYERS = 6;

const DENSITY_SCALE: Record<RelationshipFlowerDensity, number> = {
  compact: 0.9,
  comfortable: 1,
  spacious: 1.12,
};

const SLOT_GAP_DEGREES = 1.5;
const MAX_SECTOR_HALF_ANGLE_DEGREES = 68;
const COLLISION_EPSILON = 0.01;

type ConvexBody = {
  placement: RelationshipFlowerPetalPlacement;
  hull: FlowerPetalPoint[];
  bounds: FlowerPetalBounds;
};

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, value) : fallback;
}

export function normalizeFlowerPetalsPerLayer(value: unknown): number {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  const rounded = Number.isFinite(numeric)
    ? Math.round(numeric)
    : DEFAULT_FLOWER_PETALS_PER_LAYER;
  return Math.max(
    MIN_FLOWER_PETALS_PER_LAYER,
    Math.min(MAX_FLOWER_PETALS_PER_LAYER, rounded)
  );
}

export function normalizeFlowerLayerCount(value: unknown): number {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(MAX_FLOWER_LAYERS, Math.round(numeric)));
}

function balancedCountsForLayers(petalCount: number, layerCount: number): number[] {
  if (petalCount <= 0 || layerCount <= 0) return [];
  const usableLayers = Math.min(petalCount, layerCount);
  const baseCount = Math.floor(petalCount / usableLayers);
  const remainder = petalCount - baseCount * usableLayers;
  return Array.from({ length: usableLayers }, (_, layerIndex) =>
    layerIndex >= usableLayers - remainder ? baseCount + 1 : baseCount
  );
}

export function balancedFlowerLayerCounts(
  petalCount: number,
  maxPerLayer: number,
  requestedLayerCount = 0
): number[] {
  const count = Number.isFinite(petalCount) ? Math.max(0, Math.floor(petalCount)) : 0;
  if (count === 0) return [];
  const automaticLayers = Math.ceil(count / normalizeFlowerPetalsPerLayer(maxPerLayer));
  const layers = Math.max(automaticLayers, normalizeFlowerLayerCount(requestedLayerCount));
  return balancedCountsForLayers(count, layers);
}

function automaticAssignments(layerCounts: readonly number[]): number[] {
  return layerCounts.flatMap((count, layerIndex) =>
    Array.from({ length: count }, () => layerIndex)
  );
}

function radians(angle: number): number {
  return angle * Math.PI / 180;
}

function cross(origin: FlowerPetalPoint, first: FlowerPetalPoint, second: FlowerPetalPoint): number {
  return (first.x - origin.x) * (second.y - origin.y)
    - (first.y - origin.y) * (second.x - origin.x);
}

function convexHull(points: readonly FlowerPetalPoint[]): FlowerPetalPoint[] {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((first, second) => first.x - second.x || first.y - second.y)
    .filter((point, index, all) =>
      index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y
    );
  if (sorted.length <= 2) return sorted;

  const lower: FlowerPetalPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2
      && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) lower.pop();
    lower.push(point);
  }
  const upper: FlowerPetalPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2
      && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function projection(
  polygon: readonly FlowerPetalPoint[],
  axis: FlowerPetalPoint
): { minimum: number; maximum: number } {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    const value = point.x * axis.x + point.y * axis.y;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return { minimum, maximum };
}

/**
 * A cubic path lies inside the convex hull of its anchors and controls. A
 * separating axis with the requested gap therefore proves that the complete
 * filled petals, not merely sampled points, are disjoint.
 */
function convexBodiesHaveClearance(
  first: readonly FlowerPetalPoint[],
  second: readonly FlowerPetalPoint[],
  clearance: number
): boolean {
  if (first.length < 2 || second.length < 2) return true;
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const edgeX = end.x - start.x;
      const edgeY = end.y - start.y;
      const magnitude = Math.hypot(edgeX, edgeY);
      if (magnitude <= Number.EPSILON) continue;
      const axis = { x: -edgeY / magnitude, y: edgeX / magnitude };
      const firstProjection = projection(first, axis);
      const secondProjection = projection(second, axis);
      const separation = Math.max(
        secondProjection.minimum - firstProjection.maximum,
        firstProjection.minimum - secondProjection.maximum
      );
      if (separation + COLLISION_EPSILON >= clearance) return true;
    }
  }
  return false;
}

type SectorGeometryInput = FlowerPetalGeometryInput & {
  sectorHalfAngleDegrees: number;
  edgeClearance: number;
};

function placementBody(placement: RelationshipFlowerPetalPlacement): ConvexBody {
  const input: SectorGeometryInput = {
    center: { x: 0, y: 0 },
    angleDegrees: placement.angle,
    rootRadius: placement.rootRadius,
    length: placement.length,
    halfWidth: placement.halfWidth,
    labelCenterOffset: placement.labelCenterRadius - placement.rootRadius,
    labelRegionRadius: placement.labelRegionRadius,
    sectorHalfAngleDegrees: placement.sectorHalfAngleDegrees,
    edgeClearance: placement.edgeClearance,
  };
  const geometry = buildFlowerPetalGeometry(input);
  return {
    placement,
    hull: convexHull(geometry.segments.flatMap((segment) => [
      segment.start,
      segment.control1,
      segment.control2,
      segment.end,
    ])),
    bounds: flowerPetalGeometryBounds(geometry, geometry.profile.root),
  };
}

function candidateLayerBodies(
  itemIndexes: readonly number[],
  layerIndex: number,
  angles: readonly number[],
  rootRadius: number,
  length: number,
  halfWidth: number,
  labelCenterOffset: number,
  labelRegionRadius: number,
  sectorHalfAngleDegrees: number,
  edgeClearance: number
): ConvexBody[] {
  return itemIndexes.map((itemIndex, slotIndex) => placementBody({
    index: itemIndex,
    layerIndex,
    slotIndex,
    angle: angles[slotIndex],
    rootRadius,
    length,
    halfWidth,
    labelCenterRadius: rootRadius + labelCenterOffset,
    labelRegionRadius,
    sectorHalfAngleDegrees,
    edgeClearance,
  }));
}

function bodiesAreClear(
  candidates: readonly ConvexBody[],
  positioned: readonly ConvexBody[],
  clearance: number
): boolean {
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (!convexBodiesHaveClearance(candidates[first].hull, candidates[second].hull, clearance)) {
        return false;
      }
    }
    for (const existing of positioned) {
      if (!convexBodiesHaveClearance(candidates[first].hull, existing.hull, clearance)) {
        return false;
      }
    }
  }
  return true;
}

function collisionFreeLayerBodies(
  itemIndexes: readonly number[],
  layerIndex: number,
  angles: readonly number[],
  minimumRootRadius: number,
  guaranteedRootRadius: number,
  length: number,
  halfWidth: number,
  labelCenterOffset: number,
  labelRegionRadius: number,
  sectorHalfAngleDegrees: number,
  edgeClearance: number,
  positioned: readonly ConvexBody[],
  bodyGap: number
): ConvexBody[] {
  const at = (rootRadius: number) => candidateLayerBodies(
    itemIndexes,
    layerIndex,
    angles,
    rootRadius,
    length,
    halfWidth,
    labelCenterOffset,
    labelRegionRadius,
    sectorHalfAngleDegrees,
    edgeClearance
  );
  let bodies = at(minimumRootRadius);
  if (bodiesAreClear(bodies, positioned, bodyGap)) return bodies;

  const step = Math.max(3, bodyGap, halfWidth * 0.04);
  let collidingRoot = minimumRootRadius;
  let clearRoot = minimumRootRadius;
  while (clearRoot < guaranteedRootRadius - COLLISION_EPSILON) {
    collidingRoot = clearRoot;
    clearRoot = Math.min(guaranteedRootRadius, clearRoot + step);
    bodies = at(clearRoot);
    if (bodiesAreClear(bodies, positioned, bodyGap)) break;
  }
  if (!bodiesAreClear(bodies, positioned, bodyGap)) {
    clearRoot = guaranteedRootRadius + halfWidth + bodyGap;
    bodies = at(clearRoot);
  }

  // Refine the first deterministic clear interval without relying on a
  // content-dependent size or a platform-specific physics solver.
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const midpoint = (collidingRoot + clearRoot) / 2;
    const midpointBodies = at(midpoint);
    if (bodiesAreClear(midpointBodies, positioned, bodyGap)) {
      clearRoot = midpoint;
      bodies = midpointBodies;
    } else {
      collidingRoot = midpoint;
    }
  }
  return bodies;
}

/**
 * Draw-first relationship flower layout. Geometry depends only on flower
 * count/layers/density, never on label count, length, wrapping, or font size.
 */
export function layoutRelationshipFlowerPetals(
  inputs: readonly RelationshipFlowerPetalInput[],
  options: RelationshipFlowerLayoutOptions
): RelationshipFlowerLayout {
  const hubRadius = finitePositive(options.hubRadius, 88);
  const densityScale = DENSITY_SCALE[options.density] ?? DENSITY_SCALE.comfortable;
  const manualMaximum = inputs.reduce((maximum, input) =>
    Math.max(maximum, normalizeFlowerLayerCount(input.preferredLayer)), 0
  );
  const requestedLayers = Math.max(
    normalizeFlowerLayerCount(options.layerCount),
    manualMaximum
  );
  const initialCounts = balancedFlowerLayerCounts(
    inputs.length,
    options.maxPerLayer,
    requestedLayers
  );
  const assignments = automaticAssignments(initialCounts);
  inputs.forEach((input, index) => {
    const preferred = normalizeFlowerLayerCount(input.preferredLayer);
    if (preferred > 0) assignments[index] = preferred - 1;
  });
  const layerCount = assignments.length
    ? Math.max(...assignments) + 1
    : 0;
  const layerIndexes = Array.from({ length: layerCount }, () => [] as number[]);
  assignments.forEach((layerIndex, itemIndex) => {
    layerIndexes[layerIndex]?.push(itemIndex);
  });
  const nonemptyLayers = layerIndexes.filter((indexes) => indexes.length > 0);
  const layerCounts = nonemptyLayers.map((indexes) => indexes.length);

  const baseLength = hubRadius * 3.3 * densityScale;
  const labelRegionRadius = Math.min(
    baseLength * 0.29,
    hubRadius * 0.95 * densityScale
  );
  const outlinePadding = hubRadius * (
    options.density === "compact" ? 0.045 : options.density === "spacious" ? 0.075 : 0.06
  );
  const halfWidth = labelRegionRadius + outlinePadding;

  if (!inputs.length) {
    return {
      petals: [],
      layerCounts: [],
      length: baseLength,
      halfWidth,
      labelCenterOffset: baseLength * 0.58,
      labelRegionRadius,
      maximumExtent: hubRadius + 48,
    };
  }

  const maximumLayerCount = Math.max(1, ...layerCounts);
  const sectorHalfAngleDegrees = Math.min(
    MAX_SECTOR_HALF_ANGLE_DEGREES,
    Math.max(2, 180 / maximumLayerCount - SLOT_GAP_DEGREES / 2)
  );
  const sectorHalfAngleRadians = radians(sectorHalfAngleDegrees);
  const edgeClearance = hubRadius * (
    options.density === "compact" ? 0.025 : options.density === "spacious" ? 0.055 : 0.04
  );
  const bodyGap = hubRadius * (
    options.density === "compact" ? 0.02 : options.density === "spacious" ? 0.05 : 0.035
  );
  const layerGap = options.density === "compact" ? 6 : options.density === "spacious" ? 12 : 8;
  const attachmentRootRadius = hubRadius * 0.68;
  const baseLabelCenterOffset = baseLength * 0.58;
  const minimumBodyCenterRadius = (halfWidth + edgeClearance)
    / Math.max(0.01, Math.sin(sectorHalfAngleRadians));
  const attachmentInset = Math.max(
    0,
    minimumBodyCenterRadius - (attachmentRootRadius + baseLabelCenterOffset)
  );
  const length = baseLength + attachmentInset;
  const labelCenterOffset = baseLabelCenterOffset + attachmentInset;
  const positioned: ConvexBody[] = [];
  let previousRootRadius = attachmentRootRadius;

  nonemptyLayers.forEach((itemIndexes, visualLayerIndex) => {
    const count = itemIndexes.length;
    const stagger = visualLayerIndex / Math.max(1, nonemptyLayers.length)
      * (360 / count);
    const angles = itemIndexes.map((_, slotIndex) =>
      -90 + stagger + slotIndex * 360 / count
    );
    const minimumRootRadius = visualLayerIndex === 0
      ? attachmentRootRadius
      : previousRootRadius + layerGap;
    const positionedOuterRadius = positioned.reduce((maximum, body) =>
      Math.max(
        maximum,
        ...body.hull.map((point) => Math.hypot(point.x, point.y))
      ), 0
    );
    // At this radius the candidate hull starts outside every already placed
    // hull. For the first layer the extra interval is a finite fallback for
    // legacy/custom geometry that has not opted into sector-safe controls.
    const guaranteedRootRadius = positioned.length
      ? Math.max(minimumRootRadius, positionedOuterRadius + bodyGap)
      : minimumRootRadius + length + halfWidth + bodyGap;
    const bodies = collisionFreeLayerBodies(
      itemIndexes,
      visualLayerIndex,
      angles,
      minimumRootRadius,
      guaranteedRootRadius,
      length,
      halfWidth,
      labelCenterOffset,
      labelRegionRadius,
      sectorHalfAngleDegrees,
      edgeClearance,
      positioned,
      bodyGap
    );
    positioned.push(...bodies);
    previousRootRadius = bodies[0]?.placement.rootRadius ?? minimumRootRadius;
  });

  const petals = positioned.map((body) => body.placement);
  petals.sort((first, second) => first.index - second.index);
  const maximumGeometryExtent = positioned.reduce((maximum, body) => {
    const { bounds } = body;
    return Math.max(
      maximum,
      Math.abs(bounds.minX),
      Math.abs(bounds.minY),
      Math.abs(bounds.maxX),
      Math.abs(bounds.maxY)
    );
  }, hubRadius);
  const maximumExtent = maximumGeometryExtent + hubRadius * 0.5;

  return {
    petals,
    layerCounts,
    length,
    halfWidth,
    labelCenterOffset,
    labelRegionRadius,
    maximumExtent,
  };
}
