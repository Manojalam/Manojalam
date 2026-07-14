import type {
  ExportBounds,
  ExportPlan,
  ExportSafetyConstraint,
  ExportSafetyLimits,
} from "./types";

export const MAX_EXPORT_CANVAS_DIMENSION = 16_384;
export const MAX_EXPORT_TOTAL_PIXELS = 96_000_000;

export const DEFAULT_EXPORT_SAFETY_LIMITS: Readonly<ExportSafetyLimits> = {
  maxDimension: MAX_EXPORT_CANVAS_DIMENSION,
  maxTotalPixels: MAX_EXPORT_TOTAL_PIXELS,
};

type RasterDimensions = {
  width: number;
  height: number;
  totalPixels: number;
};

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function validateBounds(bounds: ExportBounds): void {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
    throw new RangeError("Export bounds must contain only finite numbers.");
  }
  assertPositiveFinite(bounds.width, "Export width");
  assertPositiveFinite(bounds.height, "Export height");
}

function validateLimits(limits: ExportSafetyLimits): void {
  assertPositiveFinite(limits.maxDimension, "Maximum canvas dimension");
  assertPositiveFinite(limits.maxTotalPixels, "Maximum total pixels");
}

function rasterDimensions(bounds: ExportBounds, scale: number): RasterDimensions {
  const rawWidth = bounds.width * scale;
  const rawHeight = bounds.height * scale;
  const width = Number.isFinite(rawWidth) ? Math.max(1, Math.ceil(rawWidth)) : Number.POSITIVE_INFINITY;
  const height = Number.isFinite(rawHeight) ? Math.max(1, Math.ceil(rawHeight)) : Number.POSITIVE_INFINITY;
  const totalPixels = width * height;
  return { width, height, totalPixels };
}

function isSafe(dimensions: RasterDimensions, limits: ExportSafetyLimits): boolean {
  return (
    Number.isFinite(dimensions.width)
    && Number.isFinite(dimensions.height)
    && Number.isFinite(dimensions.totalPixels)
    && dimensions.width <= limits.maxDimension
    && dimensions.height <= limits.maxDimension
    && dimensions.totalPixels <= limits.maxTotalPixels
  );
}

/**
 * `ceil(width * scale)` makes the safety boundary discontinuous. This helper
 * backs off from a theoretical limit until the actual integer canvas size is
 * safe, rather than relying on a fragile floating-point epsilon.
 */
function revalidateSafeScale(
  bounds: ExportBounds,
  candidateScale: number,
  limits: ExportSafetyLimits
): number {
  if (!(candidateScale > 0) || !Number.isFinite(candidateScale)) return 0;
  if (isSafe(rasterDimensions(bounds, candidateScale), limits)) return candidateScale;

  let low = 0;
  let high = candidateScale;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = low + (high - low) / 2;
    if (isSafe(rasterDimensions(bounds, midpoint), limits)) low = midpoint;
    else high = midpoint;
  }
  return low;
}

function theoreticalMaxScale(bounds: ExportBounds, limits: ExportSafetyLimits): number {
  const widthScale = limits.maxDimension / bounds.width;
  const heightScale = limits.maxDimension / bounds.height;
  // Work in logarithms so extremely large finite bounds do not underflow the
  // pixel ratio before its square root is taken.
  const pixelScale = Math.exp(
    (Math.log(limits.maxTotalPixels) - Math.log(bounds.width) - Math.log(bounds.height)) / 2
  );
  return Math.min(widthScale, heightScale, pixelScale);
}

function limitingConstraints(
  dimensions: RasterDimensions,
  limits: ExportSafetyLimits
): ExportSafetyConstraint[] {
  const constraints: ExportSafetyConstraint[] = [];
  if (dimensions.width > limits.maxDimension) constraints.push("width");
  if (dimensions.height > limits.maxDimension) constraints.push("height");
  if (dimensions.totalPixels > limits.maxTotalPixels) constraints.push("total-pixels");
  return constraints;
}

/**
 * Produces the highest safe PNG scale no greater than `requestedScale`.
 * Device pixel ratio is intentionally not applied here: callers must pass the
 * complete raster scale exactly once so output dimensions remain predictable.
 */
export function createPngExportPlan(
  bounds: ExportBounds,
  requestedScale: number,
  limits: ExportSafetyLimits = DEFAULT_EXPORT_SAFETY_LIMITS
): ExportPlan {
  validateBounds(bounds);
  assertPositiveFinite(requestedScale, "Requested export scale");
  validateLimits(limits);

  const requested = rasterDimensions(bounds, requestedScale);
  const requestedSafe = isSafe(requested, limits);
  const theoreticalMaximum = theoreticalMaxScale(bounds, limits);
  const maximumCandidate = Number.isFinite(theoreticalMaximum)
    ? theoreticalMaximum
    : Number.MAX_VALUE;
  const maxSafeScale = revalidateSafeScale(bounds, maximumCandidate, limits);

  if (!(maxSafeScale > 0)) {
    throw new RangeError("The export bounds cannot fit within the configured canvas limits.");
  }

  let effectiveScale = Math.min(requestedScale, maxSafeScale);
  effectiveScale = revalidateSafeScale(bounds, effectiveScale, limits);
  if (!(effectiveScale > 0)) {
    throw new RangeError("A safe export scale could not be calculated.");
  }

  const output = rasterDimensions(bounds, effectiveScale);
  if (!isSafe(output, limits)) {
    throw new RangeError("The calculated PNG output still exceeds the configured canvas limits.");
  }

  const adjusted = !requestedSafe || effectiveScale < requestedScale;
  return {
    format: "png",
    bounds: { ...bounds },
    limits: { ...limits },
    requestedScale,
    effectiveScale,
    maxSafeScale,
    requestedOutputWidth: requested.width,
    requestedOutputHeight: requested.height,
    requestedTotalPixels: requested.totalPixels,
    outputWidth: output.width,
    outputHeight: output.height,
    totalPixels: output.totalPixels,
    megapixels: output.totalPixels / 1_000_000,
    estimatedRgbaBytes: output.totalPixels * 4,
    requestedSafe,
    adjusted,
    status: adjusted ? "adjusted" : "safe",
    limitingConstraints: limitingConstraints(requested, limits),
  };
}

export function isPngExportPlanSafe(plan: ExportPlan): boolean {
  return (
    plan.outputWidth <= plan.limits.maxDimension
    && plan.outputHeight <= plan.limits.maxDimension
    && plan.totalPixels <= plan.limits.maxTotalPixels
  );
}
