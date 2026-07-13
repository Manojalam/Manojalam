export const RADIAL_CHART_PADDING = 22;
export const RADIAL_CENTER_RADIUS_MIN = 36;
export const RADIAL_CENTER_RADIUS_MAX = 360;
export const RADIAL_RING_WIDTH_MIN = 24;
export const RADIAL_RING_WIDTH_MAX = 320;
export const RADIAL_RING_WIDTH_DEFAULT = 84;

export type RadialBand = { innerRadius: number; outerRadius: number };

export type ResolvedRadialSizing = {
  manual: boolean;
  centerRadius: number;
  ringWidths: number[];
  bands: RadialBand[];
  outerRadius: number;
  diameter: number;
};

type RadialSizingInput = {
  chartSize: number;
  depthCount: number;
  centerRatio?: unknown;
  legacyRingWeights?: unknown;
  centerRadiusPx?: unknown;
  ringWidthsPx?: unknown;
};

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function clampRadialSize(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function bandsFromWidths(centerRadius: number, widths: number[]): RadialBand[] {
  let cursor = centerRadius;
  return widths.map((width) => {
    const band = { innerRadius: cursor, outerRadius: cursor + width };
    cursor += width;
    return band;
  });
}

function legacySizing(input: RadialSizingInput, depthCount: number): ResolvedRadialSizing {
  const diameter = Math.max(2 * RADIAL_CHART_PADDING + 1, finiteNumber(input.chartSize, 900));
  const outerRadius = Math.max(1, diameter / 2 - RADIAL_CHART_PADDING);
  const centerRatio = clampRadialSize(finiteNumber(input.centerRatio, 28), 14, 58) / 100;
  const centerRadius = outerRadius * centerRatio;
  const source = Array.isArray(input.legacyRingWeights) ? input.legacyRingWeights : [];
  const weights = Array.from({ length: depthCount }, (_, index) =>
    clampRadialSize(finiteNumber(source[index], 1), 0.000001, 1000000)
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const availableRadius = Math.max(0, outerRadius - centerRadius);
  const minimumBand = Math.min(28, availableRadius / (2 * depthCount));
  const flexibleRadius = Math.max(0, availableRadius - minimumBand * depthCount);
  const ringWidths = weights.map((weight) =>
    minimumBand + flexibleRadius * (weight / Math.max(0.01, total))
  );
  return {
    manual: false,
    centerRadius,
    ringWidths,
    bands: bandsFromWidths(centerRadius, ringWidths),
    outerRadius,
    diameter,
  };
}

export function resolveRadialSizing(input: RadialSizingInput): ResolvedRadialSizing {
  const depthCount = Math.max(1, Math.round(input.depthCount));
  const legacy = legacySizing(input, depthCount);
  const manualWidths = Array.isArray(input.ringWidthsPx) ? input.ringWidthsPx : null;
  const hasManualCenter = typeof input.centerRadiusPx === "number" && Number.isFinite(input.centerRadiusPx);
  if (!manualWidths && !hasManualCenter) return legacy;

  const centerRadius = clampRadialSize(
    finiteNumber(input.centerRadiusPx, legacy.centerRadius),
    RADIAL_CENTER_RADIUS_MIN,
    RADIAL_CENTER_RADIUS_MAX
  );
  const ringWidths = Array.from({ length: depthCount }, (_, index) => {
    const inherited = index > 0 ? finiteNumber(manualWidths?.[index - 1], RADIAL_RING_WIDTH_DEFAULT) : RADIAL_RING_WIDTH_DEFAULT;
    const fallback = manualWidths && index >= manualWidths.length
      ? inherited
      : legacy.ringWidths[index] ?? inherited;
    return clampRadialSize(
      finiteNumber(manualWidths?.[index], fallback),
      RADIAL_RING_WIDTH_MIN,
      RADIAL_RING_WIDTH_MAX
    );
  });
  const bands = bandsFromWidths(centerRadius, ringWidths);
  const outerRadius = centerRadius + ringWidths.reduce((sum, width) => sum + width, 0);
  return {
    manual: true,
    centerRadius,
    ringWidths,
    bands,
    outerRadius,
    diameter: Math.ceil(2 * (RADIAL_CHART_PADDING + outerRadius)),
  };
}
