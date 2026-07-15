export type RelationshipFlowerDensity = "compact" | "comfortable" | "spacious";

export interface RelationshipFlowerPetalInput {
  width: number;
  height: number;
}

export interface RelationshipFlowerLayoutOptions {
  hubRadius: number;
  maxPerLayer: number;
  density: RelationshipFlowerDensity;
}

export interface RelationshipFlowerPetalPlacement {
  /** Original index in the caller's ordered petal list. */
  index: number;
  /** Zero-based layer number, from the hub outward. */
  layerIndex: number;
  angle: number;
  radius: number;
  /** Circumradius of the axis-aligned content box. */
  halfExtent: number;
}

export interface RelationshipFlowerLayout {
  petals: RelationshipFlowerPetalPlacement[];
  /** Petal counts ordered from the innermost layer to the outermost layer. */
  layerCounts: number[];
  /** Half-side required by a square SVG, including the petal outline margin. */
  maximumExtent: number;
}

export const MIN_FLOWER_PETALS_PER_LAYER = 3;
export const MAX_FLOWER_PETALS_PER_LAYER = 24;
export const DEFAULT_FLOWER_PETALS_PER_LAYER = 9;

const START_ANGLE = -90;
const COLLISION_EPSILON = 0.01;

const DENSITY_METRICS: Record<
  RelationshipFlowerDensity,
  { contentGap: number; layerStep: number; outerPadding: number }
> = {
  compact: { contentGap: 10, layerStep: 14, outerPadding: 48 },
  comfortable: { contentGap: 16, layerStep: 20, outerPadding: 62 },
  spacious: { contentGap: 24, layerStep: 28, outerPadding: 76 },
};

interface NormalizedPetal extends RelationshipFlowerPetalInput {
  halfExtent: number;
}

interface PositionedPetal extends NormalizedPetal {
  index: number;
  layerIndex: number;
  angle: number;
  radius: number;
}

interface CollisionInterval {
  start: number;
  end: number;
}

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

function densityMetrics(density: RelationshipFlowerDensity) {
  return DENSITY_METRICS[density] ?? DENSITY_METRICS.comfortable;
}

/**
 * Split petals into the fewest possible layers, balancing the result while
 * assigning any extra petals to the outside layers. This keeps the visual
 * weight toward the outside without changing source order.
 */
export function balancedFlowerLayerCounts(
  petalCount: number,
  maxPerLayer: number
): number[] {
  const count = Number.isFinite(petalCount) ? Math.max(0, Math.floor(petalCount)) : 0;
  if (count === 0) return [];

  const maximum = normalizeFlowerPetalsPerLayer(maxPerLayer);
  const layerCount = Math.ceil(count / maximum);
  const baseCount = Math.floor(count / layerCount);
  const remainder = count - baseCount * layerCount;

  return Array.from({ length: layerCount }, (_, layerIndex) =>
    layerIndex >= layerCount - remainder ? baseCount + 1 : baseCount
  );
}

function radians(angle: number): number {
  return angle * Math.PI / 180;
}

function sameLayerRadius(
  petals: readonly NormalizedPetal[],
  angles: readonly number[],
  hubRadius: number,
  gap: number
): number {
  let radius = hubRadius + gap;

  petals.forEach((petal, index) => {
    const angle = radians(angles[index]);
    const radialHalfExtent =
      Math.abs(Math.cos(angle)) * petal.width / 2
      + Math.abs(Math.sin(angle)) * petal.height / 2;
    radius = Math.max(radius, hubRadius + gap + radialHalfExtent);
  });

  for (let firstIndex = 0; firstIndex < petals.length; firstIndex += 1) {
    const firstAngle = radians(angles[firstIndex]);
    const first = petals[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < petals.length; secondIndex += 1) {
      const secondAngle = radians(angles[secondIndex]);
      const second = petals[secondIndex];
      const deltaX = Math.abs(Math.cos(firstAngle) - Math.cos(secondAngle));
      const deltaY = Math.abs(Math.sin(firstAngle) - Math.sin(secondAngle));
      const requiredX = deltaX > Number.EPSILON
        ? ((first.width + second.width) / 2 + gap) / deltaX
        : Number.POSITIVE_INFINITY;
      const requiredY = deltaY > Number.EPSILON
        ? ((first.height + second.height) / 2 + gap) / deltaY
        : Number.POSITIVE_INFINITY;

      // Axis-aligned boxes are disjoint once either axis has enough clearance.
      radius = Math.max(radius, Math.min(requiredX, requiredY));
    }
  }

  return radius;
}

/**
 * Return the radii for which a point travelling outward on `angle` intersects
 * the inner petal's content box expanded by the outer petal and desired gap.
 */
function collisionInterval(
  inner: PositionedPetal,
  outer: NormalizedPetal,
  angle: number,
  gap: number
): CollisionInterval | null {
  const outerAngle = radians(angle);
  const innerAngle = radians(inner.angle);
  const direction = { x: Math.cos(outerAngle), y: Math.sin(outerAngle) };
  const innerCenter = {
    x: inner.radius * Math.cos(innerAngle),
    y: inner.radius * Math.sin(innerAngle),
  };
  const halfWidth = (inner.width + outer.width) / 2 + gap;
  const halfHeight = (inner.height + outer.height) / 2 + gap;
  const bounds = [
    { direction: direction.x, minimum: innerCenter.x - halfWidth, maximum: innerCenter.x + halfWidth },
    { direction: direction.y, minimum: innerCenter.y - halfHeight, maximum: innerCenter.y + halfHeight },
  ];

  let start = 0;
  let end = Number.POSITIVE_INFINITY;
  for (const bound of bounds) {
    if (Math.abs(bound.direction) <= Number.EPSILON) {
      if (0 < bound.minimum || 0 > bound.maximum) return null;
      continue;
    }

    const first = bound.minimum / bound.direction;
    const second = bound.maximum / bound.direction;
    start = Math.max(start, Math.min(first, second));
    end = Math.min(end, Math.max(first, second));
    if (start > end) return null;
  }

  return end >= 0 && Number.isFinite(end)
    ? { start: Math.max(0, start), end }
    : null;
}

function firstCollisionFreeRadius(
  minimumRadius: number,
  intervals: readonly CollisionInterval[]
): number {
  const sorted = [...intervals].sort((first, second) =>
    first.start - second.start || first.end - second.end
  );
  let candidate = minimumRadius;

  for (const interval of sorted) {
    if (candidate < interval.start) break;
    if (candidate <= interval.end) {
      candidate = interval.end + COLLISION_EPSILON;
    }
  }

  return candidate;
}

/**
 * Lay out ordered flower petals in balanced, concentric layers. Content boxes
 * remain screen-aligned, so spacing is computed against their axis-aligned
 * bounds rather than treating their width as if it rotated with the petal.
 */
export function layoutRelationshipFlowerPetals(
  inputPetals: readonly RelationshipFlowerPetalInput[],
  options: RelationshipFlowerLayoutOptions
): RelationshipFlowerLayout {
  const metrics = densityMetrics(options.density);
  const hubRadius = finitePositive(options.hubRadius, 104);
  const petals: NormalizedPetal[] = inputPetals.map((petal) => {
    const width = finitePositive(petal.width, 1);
    const height = finitePositive(petal.height, 1);
    return {
      width,
      height,
      halfExtent: Math.hypot(width / 2, height / 2),
    };
  });
  const layerCounts = balancedFlowerLayerCounts(petals.length, options.maxPerLayer);
  const positioned: PositionedPetal[] = [];
  let nextIndex = 0;
  let previousRadius = hubRadius;

  layerCounts.forEach((count, layerIndex) => {
    const layerPetals = petals.slice(nextIndex, nextIndex + count);
    const stagger = layerIndex % 2 === 1 ? 180 / count : 0;
    const angles = layerPetals.map((_, itemIndex) =>
      START_ANGLE + stagger + itemIndex * 360 / count
    );
    const ownLayerRadius = sameLayerRadius(
      layerPetals,
      angles,
      hubRadius,
      metrics.contentGap
    );
    const minimumRadius = layerIndex === 0
      ? ownLayerRadius
      : Math.max(ownLayerRadius, previousRadius + metrics.layerStep);
    const collisionIntervals = layerPetals.flatMap((petal, itemIndex) =>
      positioned.flatMap((inner) => {
        const interval = collisionInterval(
          inner,
          petal,
          angles[itemIndex],
          metrics.contentGap
        );
        return interval ? [interval] : [];
      })
    );
    const radius = firstCollisionFreeRadius(minimumRadius, collisionIntervals);

    layerPetals.forEach((petal, itemIndex) => {
      positioned.push({
        ...petal,
        index: nextIndex + itemIndex,
        layerIndex,
        angle: angles[itemIndex],
        radius,
      });
    });
    nextIndex += count;
    previousRadius = radius;
  });

  const contentExtent = positioned.reduce(
    (maximum, petal) => Math.max(maximum, petal.radius + petal.halfExtent),
    hubRadius
  );

  return {
    petals: positioned.map(({ index, layerIndex, angle, radius, halfExtent }) => ({
      index,
      layerIndex,
      angle,
      radius,
      halfExtent,
    })),
    layerCounts,
    maximumExtent: contentExtent + metrics.outerPadding,
  };
}
