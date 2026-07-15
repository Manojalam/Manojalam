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

function collisionFreeLabelCenterRadius(
  angles: readonly number[],
  positioned: readonly RelationshipFlowerPetalPlacement[],
  labelRegionRadius: number,
  gap: number,
  minimumRadius: number
): number {
  const requiredDistance = labelRegionRadius * 2 + gap;
  let radius = minimumRadius;
  for (const angle of angles) {
    const angleRadians = radians(angle);
    for (const inner of positioned) {
      const delta = angleRadians - radians(inner.angle);
      const transverse = inner.labelCenterRadius * Math.sin(delta);
      if (Math.abs(transverse) >= requiredDistance) continue;
      const axial = inner.labelCenterRadius * Math.cos(delta);
      const exitRadius = axial + Math.sqrt(
        Math.max(0, requiredDistance ** 2 - transverse ** 2)
      );
      radius = Math.max(radius, exitRadius);
    }
  }
  return radius;
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

  if (!inputs.length) {
    return {
      petals: [],
      layerCounts: [],
      length: hubRadius * 3.3 * densityScale,
      halfWidth: hubRadius * 1.32 * densityScale,
      labelCenterOffset: hubRadius * 1.98 * densityScale,
      labelRegionRadius: hubRadius * 0.95 * densityScale,
      maximumExtent: hubRadius + 48,
    };
  }

  const maximumLayerCount = Math.max(1, ...layerCounts);
  const length = hubRadius * 3.3 * densityScale;
  const halfWidth = Math.max(
    hubRadius * 0.92,
    Math.min(
      hubRadius * 1.46,
      hubRadius * 1.32 * Math.sqrt(9 / maximumLayerCount)
    )
  ) * densityScale;
  const labelCenterOffset = length * 0.58;
  const labelRegionRadius = Math.min(halfWidth * 0.72, length * 0.29);
  const contentGap = options.density === "compact" ? 8 : options.density === "spacious" ? 18 : 12;
  const sameLayerGap = options.density === "compact" ? 2 : options.density === "spacious" ? 8 : 4;
  const layerGap = options.density === "compact" ? 6 : options.density === "spacious" ? 12 : 8;
  const petals: RelationshipFlowerPetalPlacement[] = [];
  let previousRootRadius = Number.NEGATIVE_INFINITY;

  nonemptyLayers.forEach((itemIndexes, visualLayerIndex) => {
    const count = itemIndexes.length;
    const stagger = visualLayerIndex / Math.max(1, nonemptyLayers.length)
      * (360 / count);
    const angles = itemIndexes.map((_, slotIndex) =>
      -90 + stagger + slotIndex * 360 / count
    );
    const minimumContentRadius = count > 1
      ? (labelRegionRadius + sameLayerGap / 2) / Math.max(0.1, Math.sin(Math.PI / count))
      : hubRadius + labelCenterOffset;
    const sameLayerRoot = Math.max(
      hubRadius * 0.68,
      minimumContentRadius - labelCenterOffset
    );
    const rootRadius = visualLayerIndex === 0
      ? sameLayerRoot
      : Math.max(
          sameLayerRoot,
          previousRootRadius + layerGap,
          collisionFreeLabelCenterRadius(
            angles,
            petals,
            labelRegionRadius,
            contentGap,
            sameLayerRoot + labelCenterOffset
          ) - labelCenterOffset
        );
    itemIndexes.forEach((itemIndex, slotIndex) => {
      petals.push({
        index: itemIndex,
        layerIndex: visualLayerIndex,
        slotIndex,
        angle: angles[slotIndex],
        rootRadius,
        length,
        halfWidth,
        labelCenterRadius: rootRadius + labelCenterOffset,
        labelRegionRadius,
      });
    });
    previousRootRadius = rootRadius;
  });

  // Keep the collision-safe label rings where they are, but extend the same
  // canonical outline inward for every petal when the innermost roots would
  // otherwise leave a visible moat around the hub. Applying one shared inset
  // preserves equal petal dimensions across all layers and keeps every outer
  // tip unchanged.
  const innermostRootRadius = Math.min(...petals.map((petal) => petal.rootRadius));
  const attachmentInset = Math.max(0, innermostRootRadius - hubRadius * 0.68);
  const attachedLength = length + attachmentInset;
  petals.forEach((petal) => {
    petal.rootRadius -= attachmentInset;
    petal.length = attachedLength;
  });

  petals.sort((first, second) => first.index - second.index);
  const maximumExtent = Math.max(
    hubRadius,
    ...petals.map((petal) => petal.rootRadius + length + halfWidth * 0.15)
  ) + hubRadius * 0.5;

  return {
    petals,
    layerCounts,
    length: attachedLength,
    halfWidth,
    labelCenterOffset: labelCenterOffset + attachmentInset,
    labelRegionRadius,
    maximumExtent,
  };
}
