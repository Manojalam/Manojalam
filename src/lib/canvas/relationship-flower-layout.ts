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

export interface RelationshipFlowerBaseContact {
  startRadius: number;
  endRadius: number;
  halfAngleDegrees: number;
}

export interface RelationshipFlowerGeometricPlacement {
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
  baseContact: RelationshipFlowerBaseContact;
}

export interface RelationshipFlowerPetalPlacement extends RelationshipFlowerGeometricPlacement {
  index: number;
}

export interface RelationshipFlowerEmptyPetalPlacement extends RelationshipFlowerGeometricPlacement {
  index: null;
}

export interface RelationshipFlowerLayout {
  petals: RelationshipFlowerPetalPlacement[];
  emptyPetals: RelationshipFlowerEmptyPetalPlacement[];
  layerCounts: number[];
  layerSlotCount: number;
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
const LAYER_PROFILE_GROWTH_RATIO = 0.04;
const SPARSE_LENGTH_PROPORTION = 0.72;
const SPARSE_WIDTH_PROPORTION = 1.28;
const BASE_CONTACT_START_RATIO = 0.94;
const BASE_CONTACT_END_RATIO = 1.28;

type ConvexBody = {
  placement: RelationshipFlowerPetalPlacement | RelationshipFlowerEmptyPetalPlacement;
  hull: FlowerPetalPoint[];
  bounds: FlowerPetalBounds;
};

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, value) : fallback;
}

function flowerSlotProportions(slotCount: number): { length: number; width: number } {
  // Logarithmic density gives the largest visual correction to very sparse
  // flowers and then eases continuously toward the canonical dense profile.
  const normalizedDensity = Math.max(0, Math.min(
    1,
    Math.log(Math.max(1, slotCount)) / Math.log(MAX_FLOWER_PETALS_PER_LAYER)
  ));
  return {
    length: SPARSE_LENGTH_PROPORTION
      + (1 - SPARSE_LENGTH_PROPORTION) * normalizedDensity,
    width: SPARSE_WIDTH_PROPORTION
      - (SPARSE_WIDTH_PROPORTION - 1) * normalizedDensity,
  };
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
  const capacity = Math.ceil(petalCount / layerCount);
  return Array.from({ length: layerCount }, (_, layerIndex) =>
    Math.max(0, Math.min(capacity, petalCount - layerIndex * capacity))
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
  const requestedLayers = normalizeFlowerLayerCount(requestedLayerCount);
  const layers = requestedLayers > 0 ? requestedLayers : automaticLayers;
  return balancedCountsForLayers(count, layers);
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

function pointInsideConvexBody(
  point: FlowerPetalPoint,
  polygon: readonly FlowerPetalPoint[]
): boolean {
  let direction = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const side = cross(polygon[index], polygon[(index + 1) % polygon.length], point);
    if (Math.abs(side) <= COLLISION_EPSILON) continue;
    const nextDirection = Math.sign(side);
    if (direction !== 0 && direction !== nextDirection) return false;
    direction = nextDirection;
  }
  return polygon.length >= 3;
}

function pointToSegmentDistance(
  point: FlowerPetalPoint,
  start: FlowerPetalPoint,
  end: FlowerPetalPoint
): number {
  const edgeX = end.x - start.x;
  const edgeY = end.y - start.y;
  const magnitudeSquared = edgeX * edgeX + edgeY * edgeY;
  if (magnitudeSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const progress = Math.max(0, Math.min(1,
    ((point.x - start.x) * edgeX + (point.y - start.y) * edgeY) / magnitudeSquared
  ));
  return Math.hypot(
    point.x - (start.x + edgeX * progress),
    point.y - (start.y + edgeY * progress)
  );
}

function pointToConvexBodyDistance(
  point: FlowerPetalPoint,
  polygon: readonly FlowerPetalPoint[]
): number {
  if (polygon.length < 2) return Number.POSITIVE_INFINITY;
  if (pointInsideConvexBody(point, polygon)) return 0;
  return polygon.reduce((minimum, start, index) => Math.min(
    minimum,
    pointToSegmentDistance(point, start, polygon[(index + 1) % polygon.length])
  ), Number.POSITIVE_INFINITY);
}

function pointOnRadius(radius: number, angleDegrees: number): FlowerPetalPoint {
  const angle = radians(angleDegrees);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

type SectorGeometryInput = FlowerPetalGeometryInput & {
  sectorHalfAngleDegrees: number;
  edgeClearance: number;
  baseContact: RelationshipFlowerBaseContact;
};

function placementBody(
  placement: RelationshipFlowerPetalPlacement | RelationshipFlowerEmptyPetalPlacement
): ConvexBody {
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
    baseContact: placement.baseContact,
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

type CandidateSlot = {
  itemIndex: number | null;
  slotIndex: number;
  angle: number;
};

function candidateLayerBodies(
  slots: readonly CandidateSlot[],
  layerIndex: number,
  rootRadius: number,
  length: number,
  halfWidth: number,
  labelCenterOffset: number,
  labelRegionRadius: number,
  sectorHalfAngleDegrees: number,
  edgeClearance: number,
  baseContact: RelationshipFlowerBaseContact
): ConvexBody[] {
  return slots.map((slot) => {
    const common: RelationshipFlowerGeometricPlacement = {
      layerIndex,
      slotIndex: slot.slotIndex,
      angle: slot.angle,
      rootRadius,
      length,
      halfWidth,
      labelCenterRadius: rootRadius + labelCenterOffset,
      labelRegionRadius,
      sectorHalfAngleDegrees,
      edgeClearance,
      baseContact,
    };
    return placementBody(slot.itemIndex === null
      ? { ...common, index: null }
      : { ...common, index: slot.itemIndex });
  });
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

function labelCirclesAreClear(
  candidates: readonly ConvexBody[],
  positioned: readonly ConvexBody[],
  clearance: number
): boolean {
  for (let first = 0; first < candidates.length; first += 1) {
    const firstPlacement = candidates[first].placement;
    if (firstPlacement.index === null) continue;
    const firstCenter = pointOnRadius(
      firstPlacement.labelCenterRadius,
      firstPlacement.angle
    );
    for (let second = first + 1; second < candidates.length; second += 1) {
      const secondPlacement = candidates[second].placement;
      if (secondPlacement.index === null) continue;
      const secondCenter = pointOnRadius(
        secondPlacement.labelCenterRadius,
        secondPlacement.angle
      );
      if (
        Math.hypot(firstCenter.x - secondCenter.x, firstCenter.y - secondCenter.y)
        + COLLISION_EPSILON
        < firstPlacement.labelRegionRadius + secondPlacement.labelRegionRadius + clearance
      ) return false;
    }
    for (const existing of positioned) {
      const existingPlacement = existing.placement;
      if (existingPlacement.index === null) continue;
      const existingCenter = pointOnRadius(
        existingPlacement.labelCenterRadius,
        existingPlacement.angle
      );
      if (
        Math.hypot(firstCenter.x - existingCenter.x, firstCenter.y - existingCenter.y)
        + COLLISION_EPSILON
        < firstPlacement.labelRegionRadius + existingPlacement.labelRegionRadius + clearance
      ) return false;
    }
  }
  return true;
}

function labelsClearForegroundBodies(
  candidates: readonly ConvexBody[],
  positioned: readonly ConvexBody[],
  clearance: number
): boolean {
  for (const candidate of candidates) {
    const placement = candidate.placement;
    if (placement.index === null) continue;
    const center = pointOnRadius(placement.labelCenterRadius, placement.angle);
    for (const foreground of positioned) {
      if (
        pointToConvexBodyDistance(center, foreground.hull) + COLLISION_EPSILON
        < placement.labelRegionRadius + clearance
      ) return false;
    }
  }
  return true;
}

function collisionFreeLabelCenterRadius(
  angles: readonly number[],
  positioned: readonly ConvexBody[],
  labelRegionRadius: number,
  clearance: number,
  minimumRadius: number
): number {
  let radius = minimumRadius;
  for (const angle of angles) {
    const angleRadians = radians(angle);
    for (const existing of positioned) {
      const placement = existing.placement;
      if (placement.index === null) continue;
      const requiredDistance = labelRegionRadius
        + placement.labelRegionRadius
        + clearance;
      const delta = angleRadians - radians(placement.angle);
      const transverse = placement.labelCenterRadius * Math.sin(delta);
      if (Math.abs(transverse) >= requiredDistance) continue;
      const axial = placement.labelCenterRadius * Math.cos(delta);
      radius = Math.max(
        radius,
        axial + Math.sqrt(Math.max(0, requiredDistance ** 2 - transverse ** 2))
      );
    }
  }
  return radius;
}

function compactNestedLayerBodies(
  slots: readonly CandidateSlot[],
  layerIndex: number,
  minimumLabelCenterRadius: number,
  guaranteedLabelCenterRadius: number,
  attachmentRootRadius: number,
  tailLength: number,
  halfWidth: number,
  labelRegionRadius: number,
  sectorHalfAngleDegrees: number,
  edgeClearance: number,
  baseContact: RelationshipFlowerBaseContact,
  positioned: readonly ConvexBody[],
  labelGap: number
): ConvexBody[] {
  const at = (labelCenterRadius: number) => {
    // The compact profile decides only where the label and visible tip sit.
    // Extend its hidden inner side back to one common point beneath the hub so
    // every back layer structurally fills the gaps between foreground petals.
    const tipRadius = labelCenterRadius + tailLength;
    const structuralLength = tipRadius - attachmentRootRadius;
    const structuralLabelCenterOffset = labelCenterRadius - attachmentRootRadius;
    return candidateLayerBodies(
      slots,
      layerIndex,
      attachmentRootRadius,
      structuralLength,
      halfWidth,
      structuralLabelCenterOffset,
      labelRegionRadius,
      sectorHalfAngleDegrees,
      edgeClearance,
      baseContact
    );
  };
  const clear = (bodies: readonly ConvexBody[]) =>
    // Sectors within one layer must remain separate, but flower layers are
    // deliberately allowed to overlap so that later layers tuck behind the
    // preceding flower instead of starting beyond it.
    bodiesAreClear(bodies, [], 0)
    && labelCirclesAreClear(bodies, positioned, labelGap)
    && labelsClearForegroundBodies(bodies, positioned, labelGap / 2);
  const analyticMinimum = collisionFreeLabelCenterRadius(
    slots.filter((slot) => slot.itemIndex !== null).map((slot) => slot.angle),
    positioned,
    labelRegionRadius,
    labelGap,
    minimumLabelCenterRadius
  );
  let bodies = at(analyticMinimum);
  if (clear(bodies)) return bodies;

  const step = Math.max(3, labelGap, labelRegionRadius * 0.04);
  let collidingRadius = analyticMinimum;
  let clearRadius = analyticMinimum;
  while (clearRadius < guaranteedLabelCenterRadius - COLLISION_EPSILON) {
    collidingRadius = clearRadius;
    clearRadius = Math.min(guaranteedLabelCenterRadius, clearRadius + step);
    bodies = at(clearRadius);
    if (clear(bodies)) break;
  }
  // The guaranteed radius places the complete label circle outside the
  // foregrounds' radial extent. Keep a deterministic finite fallback for a
  // custom geometry whose same-layer controls are wider than its sector.
  if (!clear(bodies)) {
    collidingRadius = clearRadius;
    clearRadius = guaranteedLabelCenterRadius + tailLength + halfWidth + labelGap;
    bodies = at(clearRadius);
  }

  // Refine the first deterministic clear interval without relying on a
  // content-dependent size or a platform-specific physics solver.
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const midpoint = (collidingRadius + clearRadius) / 2;
    const midpointBodies = at(midpoint);
    if (clear(midpointBodies)) {
      clearRadius = midpoint;
      bodies = midpointBodies;
    } else {
      collidingRadius = midpoint;
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
  const automaticLayerCount = inputs.length
    ? Math.ceil(inputs.length / normalizeFlowerPetalsPerLayer(options.maxPerLayer))
    : 0;
  const requestedLayerCount = normalizeFlowerLayerCount(options.layerCount);
  const configuredLayerCount = requestedLayerCount > 0
    ? requestedLayerCount
    : automaticLayerCount;
  const layerCount = Math.max(
    configuredLayerCount,
    manualMaximum
  );
  const pinnedCounts = Array.from({ length: layerCount }, () => 0);
  const assignments = Array.from({ length: inputs.length }, () => -1);
  inputs.forEach((input, index) => {
    const preferred = normalizeFlowerLayerCount(input.preferredLayer);
    if (preferred <= 0) return;
    assignments[index] = preferred - 1;
    pinnedCounts[preferred - 1] += 1;
  });
  const automaticSlotCapacity = layerCount > 0
    ? Math.ceil(inputs.length / layerCount)
    : 0;
  const assignmentCapacity = Math.max(automaticSlotCapacity, ...pinnedCounts, 0);
  let nextUnpinnedIndex = 0;
  const unpinnedIndexes = assignments
    .map((layerIndex, itemIndex) => ({ layerIndex, itemIndex }))
    .filter(({ layerIndex }) => layerIndex < 0)
    .map(({ itemIndex }) => itemIndex);
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    let count = pinnedCounts[layerIndex];
    while (count < assignmentCapacity && nextUnpinnedIndex < unpinnedIndexes.length) {
      assignments[unpinnedIndexes[nextUnpinnedIndex]] = layerIndex;
      nextUnpinnedIndex += 1;
      count += 1;
    }
  }
  const layerIndexes = Array.from({ length: layerCount }, () => [] as number[]);
  assignments.forEach((layerIndex, itemIndex) => {
    layerIndexes[layerIndex]?.push(itemIndex);
  });
  const layerCounts = layerIndexes.map((indexes) => indexes.length);
  const layerSlotCount = Math.max(1, ...layerCounts);

  const canonicalLength = hubRadius * 3.3 * densityScale;
  const labelRegionRadius = Math.min(
    canonicalLength * 0.29,
    hubRadius * 0.95 * densityScale
  );
  const outlinePadding = hubRadius * (
    options.density === "spacious" ? 0.075 : 0.065
  );
  const canonicalHalfWidth = labelRegionRadius + outlinePadding;

  if (!inputs.length) {
    return {
      petals: [],
      emptyPetals: [],
      layerCounts: [],
      layerSlotCount: 0,
      length: canonicalLength,
      halfWidth: canonicalHalfWidth,
      labelCenterOffset: canonicalLength * 0.58,
      labelRegionRadius,
      maximumExtent: hubRadius + 48,
    };
  }

  const slotProportions = flowerSlotProportions(layerSlotCount);
  const baseLength = canonicalLength * slotProportions.length;
  const halfWidth = canonicalHalfWidth * slotProportions.width;

  const sectorHalfAngleDegrees = Math.min(
    MAX_SECTOR_HALF_ANGLE_DEGREES,
    Math.max(2, 180 / layerSlotCount - SLOT_GAP_DEGREES / 2)
  );
  const sectorHalfAngleRadians = radians(sectorHalfAngleDegrees);
  const edgeClearance = hubRadius * (
    options.density === "compact" ? 0.025 : options.density === "spacious" ? 0.055 : 0.04
  );
  const labelGap = hubRadius * (
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
  const baseTailLength = length - labelCenterOffset;
  const baseContact: RelationshipFlowerBaseContact = {
    startRadius: hubRadius * BASE_CONTACT_START_RATIO,
    endRadius: hubRadius * BASE_CONTACT_END_RATIO,
    halfAngleDegrees: 180 / layerSlotCount,
  };
  const positioned: ConvexBody[] = [];
  let previousLabelCenterRadius = attachmentRootRadius + labelCenterOffset;

  const petalSpacing = 360 / layerSlotCount;
  const layerOffset = petalSpacing / layerCount;

  layerIndexes.forEach((itemIndexes, visualLayerIndex) => {
    // Continue the source order through the closing gap of each flower: the
    // first petal in a later layer sits between the preceding layer's last and
    // first axes. Empty slots remain real geometry so every layer shares one
    // complete angular grid even when its content count is lower.
    const layerStartAngle = -90 - visualLayerIndex * layerOffset;
    const slots: CandidateSlot[] = Array.from({ length: layerSlotCount }, (_, slotIndex) => ({
      itemIndex: itemIndexes[slotIndex] ?? null,
      slotIndex,
      angle: layerStartAngle + slotIndex * petalSpacing,
    }));
    const profileGrowth = visualLayerIndex
      * labelRegionRadius
      * LAYER_PROFILE_GROWTH_RATIO;
    const layerHalfWidth = halfWidth + profileGrowth;
    const layerTailLength = baseTailLength + profileGrowth;
    const layerMinimumBodyCenterRadius = (layerHalfWidth + edgeClearance)
      / Math.max(0.01, Math.sin(sectorHalfAngleRadians));
    const sameLayerLabelCenterRadius = itemIndexes.length > 1
      ? (labelRegionRadius + labelGap / 2)
        / Math.max(0.01, Math.sin(Math.PI / layerSlotCount))
      : attachmentRootRadius + labelCenterOffset;
    const minimumLabelCenterRadius = Math.max(
      attachmentRootRadius + labelCenterOffset,
      layerMinimumBodyCenterRadius,
      sameLayerLabelCenterRadius,
      visualLayerIndex === 0 ? 0 : previousLabelCenterRadius + layerGap
    );
    const positionedOuterRadius = positioned.reduce((maximum, body) =>
      Math.max(
        maximum,
        ...body.hull.map((point) => Math.hypot(point.x, point.y))
      ), 0
    );
    // At this center radius the complete safe label circle is outside the
    // radial extent of every foreground hull. The actual placement is refined
    // inward to the first radius that clears those hulls and all label circles.
    const guaranteedLabelCenterRadius = positioned.length
      ? Math.max(
        minimumLabelCenterRadius,
        positionedOuterRadius + labelRegionRadius + labelGap / 2
      )
      : minimumLabelCenterRadius
        + labelCenterOffset
        + layerTailLength
        + layerHalfWidth
        + labelGap;
    const bodies = compactNestedLayerBodies(
      slots,
      visualLayerIndex,
      minimumLabelCenterRadius,
      guaranteedLabelCenterRadius,
      attachmentRootRadius,
      layerTailLength,
      layerHalfWidth,
      labelRegionRadius,
      sectorHalfAngleDegrees,
      edgeClearance,
      baseContact,
      positioned,
      labelGap
    );
    positioned.push(...bodies);
    previousLabelCenterRadius = bodies[0]?.placement.labelCenterRadius
      ?? minimumLabelCenterRadius;
  });

  const petals = positioned
    .map((body) => body.placement)
    .filter((placement): placement is RelationshipFlowerPetalPlacement => placement.index !== null);
  const emptyPetals = positioned
    .map((body) => body.placement)
    .filter((placement): placement is RelationshipFlowerEmptyPetalPlacement => placement.index === null);
  petals.sort((first, second) => first.index - second.index);
  emptyPetals.sort((first, second) =>
    first.layerIndex - second.layerIndex || first.slotIndex - second.slotIndex
  );
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
    emptyPetals,
    layerCounts,
    layerSlotCount,
    length,
    halfWidth,
    labelCenterOffset,
    labelRegionRadius,
    maximumExtent,
  };
}
