export interface RelationshipFanTargetInput {
  targetNodeId: string;
  label: string;
  /** Optional browser-measured width at the configured fan font size. */
  measuredTextWidth?: number;
}

export interface RelationshipFanSourceGeometry {
  sourceNodeId: string;
  relationType: string;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  sourceFill: string;
  sourceFillEnd?: string;
  /** Targets must already be in chart/childOrder order. */
  targets: readonly RelationshipFanTargetInput[];
  /** Hides the panel while retaining its count badge. */
  visible?: boolean;
  showCountBadge?: boolean;
}

export interface RelationshipFanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface RelationshipFanInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RelationshipFanLabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize: number;
  hidden: boolean;
}

export interface RelationshipFanCellLayout {
  targetNodeId: string;
  label: string;
  startAngle: number;
  endAngle: number;
  path: string;
  fill: string;
  stroke: string;
  labelBox: RelationshipFanLabelBox;
}

export interface RelationshipFanCountBadgeLayout {
  x: number;
  y: number;
  radius: number;
  count: number;
  fill: string;
  stroke: string;
  textColor: string;
}

export interface RelationshipFanLayout {
  id: string;
  sourceNodeId: string;
  relationType: string;
  count: number;
  visible: boolean;
  lane: number;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  attachmentPath: string | null;
  attachmentStroke: string;
  connectorSourceAngle: number;
  connectorTargetAngle: number;
  connectorInnerRadius: number;
  connectorOuterRadius: number;
  cells: RelationshipFanCellLayout[];
  countBadge: RelationshipFanCountBadgeLayout | null;
}

export interface RelationshipFanLayoutOptions {
  centerX: number;
  centerY: number;
  chartOuterRadius: number;
  /** Defaults to the circle described by center + chartOuterRadius. */
  chartBounds?: Pick<RelationshipFanBounds, "minX" | "minY" | "maxX" | "maxY">;
  fanFontSize?: number;
  minimumFanFontSize?: number;
  fanThickness?: number;
  attachmentGap?: number;
  cellPaddingX?: number;
  cellPaddingY?: number;
  minimumCellArcWidth?: number;
  minimumFanAngle?: number;
  maximumFanAngle?: number;
  angularCollisionGap?: number;
  countBadgeRadius?: number;
  boundsPadding?: number;
}

export interface RelationshipFanLayoutResult {
  fans: RelationshipFanLayout[];
  bounds: RelationshipFanBounds;
  insets: RelationshipFanInsets;
}

type Point = { x: number; y: number };
type MutableBounds = { minX: number; minY: number; maxX: number; maxY: number };
type HslColor = { h: number; s: number; l: number };

const DEFAULT_FONT_SIZE = 15;
const DEFAULT_MINIMUM_FONT_SIZE = 10;
const DEFAULT_FAN_THICKNESS = 38;
const DEFAULT_ATTACHMENT_GAP = 8;
const DEFAULT_CELL_PADDING_X = 9;
const DEFAULT_CELL_PADDING_Y = 6;
const DEFAULT_MINIMUM_CELL_ARC_WIDTH = 34;
const DEFAULT_MINIMUM_FAN_ANGLE = 8;
const DEFAULT_MAXIMUM_FAN_ANGLE = 160;
const DEFAULT_COLLISION_GAP = 1.5;
const DEFAULT_BADGE_RADIUS = 12;
const DEFAULT_BOUNDS_PADDING = 12;

const graphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("sa", { granularity: "grapheme" })
  : null;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function hslString(color: HslColor): string {
  return `hsl(${normalizeHue(color.h).toFixed(1)}, ${clamp(color.s, 0, 100).toFixed(1)}%, ${clamp(color.l, 0, 100).toFixed(1)}%)`;
}

function rgbToHsl(red: number, green: number, blue: number): HslColor {
  const r = clamp(red, 0, 255) / 255;
  const g = clamp(green, 0, 255) / 255;
  const b = clamp(blue, 0, 255) / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: normalizeHue(hue), s: saturation * 100, l: lightness * 100 };
}

function parseColor(value: string): HslColor | null {
  const source = value.trim();
  const hex = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const expanded = hex[1].length === 3
      ? hex[1].split("").map((character) => `${character}${character}`).join("")
      : hex[1];
    return rgbToHsl(
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16)
    );
  }

  const hsl = source.match(/^hsla?\(\s*(-?[\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/i);
  if (hsl) return {
    h: normalizeHue(Number(hsl[1])),
    s: clamp(Number(hsl[2]), 0, 100),
    l: clamp(Number(hsl[3]), 0, 100),
  };

  const rgb = source.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  return rgb ? rgbToHsl(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])) : null;
}

export function lighterRelationshipColor(color: string, lightnessIncrease = 18): string {
  const parsed = parseColor(color);
  if (!parsed) {
    const sourceShare = clamp(100 - lightnessIncrease, 20, 95);
    return `color-mix(in srgb, ${color} ${sourceShare.toFixed(0)}%, white)`;
  }
  return hslString({
    h: parsed.h,
    s: clamp(parsed.s - lightnessIncrease * 0.22, 28, 90),
    l: clamp(parsed.l + lightnessIncrease, 26, 92),
  });
}

function textColorFor(background: string): string {
  const parsed = parseColor(background);
  return parsed && parsed.l < 52 ? "#f8fafc" : "#0f172a";
}

function isDevanagari(value: string): boolean {
  return /[\u0900-\u097f]/u.test(value);
}

function graphemeCount(value: string): number {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value)).length
    : Array.from(value).length;
}

export function estimateRelationshipLabelWidth(label: string, fontSize = DEFAULT_FONT_SIZE): number {
  const factor = isDevanagari(label) ? 0.64 : 0.56;
  return graphemeCount(label.normalize("NFC")) * Math.max(1, fontSize) * factor;
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function annularSectorPath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const span = Math.max(0.01, endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;
  const outerStart = pointOnCircle(centerX, centerY, outerRadius, startAngle);
  const outerEnd = pointOnCircle(centerX, centerY, outerRadius, endAngle);
  const innerEnd = pointOnCircle(centerX, centerY, innerRadius, endAngle);
  const innerStart = pointOnCircle(centerX, centerY, innerRadius, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function uprightTangentialRotation(angle: number): number {
  const base = angle + 90;
  const normalized = ((base % 360) + 360) % 360;
  return normalized > 90 && normalized < 270 ? base + 180 : base;
}

function unwrappedAngles(startAngle: number, endAngle: number): { start: number; end: number; mid: number } {
  let end = endAngle;
  while (end <= startAngle) end += 360;
  return { start: startAngle, end, mid: (startAngle + end) / 2 };
}

function normalizedAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * A monotone polar leader. When source and target angles keep the same cyclic
 * order, interpolating every leader with the same radial progress guarantees
 * that leaders cannot cross inside the reserved connector gutter.
 */
type PolarLeaderGeometry = { path: string; points: Point[] };

function polarLeaderGeometry(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  sourceAngle: number,
  targetAngle: number
): PolarLeaderGeometry | null {
  if (outerRadius <= innerRadius + 0.5) return null;
  const steps = 24;
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const eased = progress * progress * (3 - 2 * progress);
    const radius = innerRadius + (outerRadius - innerRadius) * progress;
    const angle = sourceAngle + (targetAngle - sourceAngle) * eased;
    points.push(pointOnCircle(centerX, centerY, radius, angle));
  }
  return {
    path: points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" "),
    points,
  };
}

function includePoint(bounds: MutableBounds, point: Point, padding = 0): void {
  bounds.minX = Math.min(bounds.minX, point.x - padding);
  bounds.minY = Math.min(bounds.minY, point.y - padding);
  bounds.maxX = Math.max(bounds.maxX, point.x + padding);
  bounds.maxY = Math.max(bounds.maxY, point.y + padding);
}

function includeArc(
  bounds: MutableBounds,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  padding = 0
): void {
  includePoint(bounds, pointOnCircle(centerX, centerY, radius, startAngle), padding);
  includePoint(bounds, pointOnCircle(centerX, centerY, radius, endAngle), padding);
  const firstQuarter = Math.ceil(startAngle / 90);
  const lastQuarter = Math.floor(endAngle / 90);
  for (let quarter = firstQuarter; quarter <= lastQuarter; quarter += 1) {
    includePoint(bounds, pointOnCircle(centerX, centerY, radius, quarter * 90), padding);
  }
}

function includeRotatedRectangle(bounds: MutableBounds, box: RelationshipFanLabelBox): void {
  if (box.hidden) return;
  const radians = (box.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  for (const localX of [-box.width / 2, box.width / 2]) {
    for (const localY of [-box.height / 2, box.height / 2]) {
      includePoint(bounds, {
        x: box.x + localX * cosine - localY * sine,
        y: box.y + localX * sine + localY * cosine,
      });
    }
  }
}

function finalizedBounds(bounds: MutableBounds): RelationshipFanBounds {
  return {
    ...bounds,
    width: Math.max(0, bounds.maxX - bounds.minX),
    height: Math.max(0, bounds.maxY - bounds.minY),
  };
}

export function layoutRelationshipFans(
  sources: readonly RelationshipFanSourceGeometry[],
  options: RelationshipFanLayoutOptions
): RelationshipFanLayoutResult {
  const centerX = finite(options.centerX, 0);
  const centerY = finite(options.centerY, 0);
  const chartOuterRadius = Math.max(1, finite(options.chartOuterRadius, 1));
  const fanFontSize = clamp(finite(options.fanFontSize, DEFAULT_FONT_SIZE), 6, 96);
  const minimumFanFontSize = clamp(
    finite(options.minimumFanFontSize, DEFAULT_MINIMUM_FONT_SIZE),
    5,
    fanFontSize
  );
  const fanThickness = Math.max(
    finite(options.fanThickness, DEFAULT_FAN_THICKNESS),
    fanFontSize * 1.65
  );
  const attachmentGap = Math.max(0, finite(options.attachmentGap, DEFAULT_ATTACHMENT_GAP));
  const cellPaddingX = Math.max(0, finite(options.cellPaddingX, DEFAULT_CELL_PADDING_X));
  const cellPaddingY = Math.max(0, finite(options.cellPaddingY, DEFAULT_CELL_PADDING_Y));
  const minimumCellArcWidth = Math.max(4, finite(
    options.minimumCellArcWidth,
    DEFAULT_MINIMUM_CELL_ARC_WIDTH
  ));
  const minimumFanAngle = clamp(finite(
    options.minimumFanAngle,
    DEFAULT_MINIMUM_FAN_ANGLE
  ), 0.5, 90);
  const maximumFanAngle = clamp(finite(
    options.maximumFanAngle,
    DEFAULT_MAXIMUM_FAN_ANGLE
  ), minimumFanAngle, 300);
  const collisionGap = Math.max(0, finite(
    options.angularCollisionGap,
    DEFAULT_COLLISION_GAP
  ));
  const badgeRadius = Math.max(7, finite(options.countBadgeRadius, DEFAULT_BADGE_RADIUS));
  const boundsPadding = Math.max(0, finite(options.boundsPadding, DEFAULT_BOUNDS_PADDING));
  const baseBounds = options.chartBounds ?? {
    minX: centerX - chartOuterRadius,
    minY: centerY - chartOuterRadius,
    maxX: centerX + chartOuterRadius,
    maxY: centerY + chartOuterRadius,
  };
  const bounds: MutableBounds = { ...baseBounds };

  const preparedSources = sources
    .map((source, originalIndex) => {
      const sourceAngles = unwrappedAngles(source.startAngle, source.endAngle);
      const targetWidths = source.targets.map((target) => {
        const measured = finite(
          target.measuredTextWidth,
          estimateRelationshipLabelWidth(target.label, fanFontSize)
        );
        return Math.max(minimumCellArcWidth, measured + cellPaddingX * 2);
      });
      return {
        source,
        originalIndex,
        sourceAngles,
        normalizedMid: normalizedAngle(sourceAngles.mid),
        visible: source.visible !== false,
        targetWidths,
        totalTargetArcWidth: targetWidths.reduce((sum, width) => sum + width, 0),
      };
    })
    .filter(({ source }) => source.targets.length > 0)
    .sort((first, second) =>
      first.normalizedMid - second.normalizedMid
      || first.source.sourceNodeId.localeCompare(second.source.sourceNodeId)
      || first.source.relationType.localeCompare(second.source.relationType)
      || first.originalIndex - second.originalIndex
    );
  if (!preparedSources.length) {
    return {
      fans: [],
      bounds: finalizedBounds({ ...baseBounds }),
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }

  const visibleSources = preparedSources.filter((candidate) => candidate.visible);
  const visibleCount = visibleSources.length;
  const panelGapDegrees = visibleCount > 1
    ? Math.min(collisionGap, Math.max(0.1, 180 / visibleCount))
    : 0;
  const availableFanDegrees = Math.max(1, 360 - panelGapDegrees * visibleCount);
  const adaptiveMinimumFanAngle = visibleCount
    ? Math.min(
        minimumFanAngle,
        Math.max(Number.EPSILON, (availableFanDegrees / visibleCount) * 0.45)
      )
    : minimumFanAngle;
  const maximumFanRadians = Math.max(0.001, maximumFanAngle * Math.PI / 180);
  const baseLabelRadius = chartOuterRadius + attachmentGap + fanThickness / 2;
  const maximumAngleRadius = visibleSources.reduce(
    (radius, candidate) => Math.max(
      radius,
      candidate.totalTargetArcWidth / maximumFanRadians
    ),
    baseLabelRadius
  );
  const requiredDegreesAtRadius = (radius: number) => visibleSources.reduce(
    (total, candidate) => total + Math.max(
      adaptiveMinimumFanAngle,
      (candidate.totalTargetArcWidth / Math.max(1, radius)) * (180 / Math.PI)
    ),
    0
  );

  let sharedLabelRadius = maximumAngleRadius;
  if (visibleCount && requiredDegreesAtRadius(sharedLabelRadius) > availableFanDegrees) {
    let lowerRadius = sharedLabelRadius;
    let upperRadius = Math.max(lowerRadius + 1, lowerRadius * 1.25);
    let expansionAttempts = 0;
    while (
      requiredDegreesAtRadius(upperRadius) > availableFanDegrees
      && expansionAttempts < 64
    ) {
      upperRadius *= 1.5;
      expansionAttempts += 1;
    }
    // Find the smallest shared radius that fits every visible fan on one ring.
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const candidateRadius = (lowerRadius + upperRadius) / 2;
      if (requiredDegreesAtRadius(candidateRadius) > availableFanDegrees) {
        lowerRadius = candidateRadius;
      } else {
        upperRadius = candidateRadius;
      }
    }
    sharedLabelRadius = upperRadius;
  }
  const sharedInnerRadius = sharedLabelRadius - fanThickness / 2;
  const sharedOuterRadius = sharedInnerRadius + fanThickness;

  type PackedGeometry = {
    sourceAngle: number;
    targetAngle: number;
    startAngle: number;
    endAngle: number;
  };
  const packedByInputIndex = new Map<number, PackedGeometry>();

  if (visibleCount) {
    const fanAngles = new Map(visibleSources.map((candidate) => [
      candidate.originalIndex,
      Math.max(
        adaptiveMinimumFanAngle,
        (candidate.totalTargetArcWidth / sharedLabelRadius) * (180 / Math.PI)
      ),
    ]));

    // Cut the cycle inside its largest source-angle gap. This avoids seam
    // artifacts for crowded fans around 0/360 degrees.
    let largestGapIndex = 0;
    let largestGap = -1;
    visibleSources.forEach((candidate, index) => {
      const next = visibleSources[(index + 1) % visibleCount];
      const nextAngle = next.normalizedMid + (index === visibleCount - 1 ? 360 : 0);
      const gap = nextAngle - candidate.normalizedMid;
      if (gap > largestGap) {
        largestGap = gap;
        largestGapIndex = index;
      }
    });
    const firstIndex = (largestGapIndex + 1) % visibleCount;
    const packedOrder = [
      ...visibleSources.slice(firstIndex),
      ...visibleSources.slice(0, firstIndex),
    ];
    const sourceAngles: number[] = [];
    packedOrder.forEach((candidate, index) => {
      let angle = candidate.normalizedMid;
      if (index > 0) {
        while (angle < sourceAngles[index - 1]) angle += 360;
      }
      sourceAngles.push(angle);
    });
    // Nearby sources (including multiple relationship types on one source)
    // need distinct ports or their stroked leaders merge at the chart edge.
    // Solve the largest feasible separation while keeping every port inside
    // its source wedge and preserving cyclic order. If a cluster is denser
    // than the available wedge space, its leaders intentionally bundle.
    const desiredPortClearance = Math.min(
      1.5,
      Math.max(0.2, (6 / Math.max(1, chartOuterRadius + 2)) * (180 / Math.PI)),
      (360 / visibleCount) * 0.8
    );
    const sourcePortRanges = packedOrder.map((candidate, index) => {
      const halfSpan = (candidate.sourceAngles.end - candidate.sourceAngles.start) / 2;
      return {
        preferred: sourceAngles[index],
        minimum: sourceAngles[index] - halfSpan,
        maximum: sourceAngles[index] + halfSpan,
      };
    });
    const solveSourcePorts = (separation: number): number[] | null => {
      let minimumFirst = sourcePortRanges[0].minimum;
      let maximumFirst = sourcePortRanges[0].maximum;
      for (let index = 0; index < visibleCount; index += 1) {
        maximumFirst = Math.min(
          maximumFirst,
          sourcePortRanges[index].maximum - index * separation
        );
        minimumFirst = Math.max(
          minimumFirst,
          sourcePortRanges[index].minimum
            + (visibleCount - index) * separation
            - 360
        );
      }
      if (minimumFirst > maximumFirst + 1e-9) return null;

      const preferredFirst = sourcePortRanges.reduce(
        (sum, range, index) => sum + range.preferred - index * separation,
        0
      ) / visibleCount;
      const first = clamp(preferredFirst, minimumFirst, maximumFirst);
      const upperBounds = new Array<number>(visibleCount);
      upperBounds[visibleCount - 1] = Math.min(
        sourcePortRanges[visibleCount - 1].maximum,
        first + 360 - separation
      );
      for (let index = visibleCount - 2; index >= 0; index -= 1) {
        upperBounds[index] = Math.min(
          sourcePortRanges[index].maximum,
          upperBounds[index + 1] - separation
        );
      }
      if (first > upperBounds[0] + 1e-9) return null;

      const ports = [first];
      for (let index = 1; index < visibleCount; index += 1) {
        const minimum = Math.max(
          sourcePortRanges[index].minimum,
          ports[index - 1] + separation
        );
        if (minimum > upperBounds[index] + 1e-9) return null;
        ports[index] = clamp(
          sourcePortRanges[index].preferred,
          minimum,
          upperBounds[index]
        );
      }
      return ports;
    };

    let resolvedSourcePorts = solveSourcePorts(desiredPortClearance);
    if (!resolvedSourcePorts) {
      let lowerSeparation = 0;
      let upperSeparation = desiredPortClearance;
      resolvedSourcePorts = solveSourcePorts(0);
      for (let iteration = 0; iteration < 32; iteration += 1) {
        const candidateSeparation = (lowerSeparation + upperSeparation) / 2;
        const candidatePorts = solveSourcePorts(candidateSeparation);
        if (candidatePorts) {
          lowerSeparation = candidateSeparation;
          resolvedSourcePorts = candidatePorts;
        } else {
          upperSeparation = candidateSeparation;
        }
      }
    }
    resolvedSourcePorts?.forEach((angle, index) => {
      sourceAngles[index] = angle;
    });
    const spans = packedOrder.map((candidate) => fanAngles.get(candidate.originalIndex) ?? 0);
    const availableExtra = Math.max(
      0,
      360 - spans.reduce((sum, span) => sum + span, 0) - panelGapDegrees * visibleCount
    );
    const desiredExtras = packedOrder.map((_, index) => {
      const nextIndex = (index + 1) % visibleCount;
      const sourceGap = nextIndex
        ? sourceAngles[nextIndex] - sourceAngles[index]
        : sourceAngles[0] + 360 - sourceAngles[index];
      const requiredCenterGap = spans[index] / 2
        + spans[nextIndex] / 2
        + panelGapDegrees;
      return Math.max(0, sourceGap - requiredCenterGap);
    });
    const desiredExtraTotal = desiredExtras.reduce((sum, gap) => sum + gap, 0);
    const allocatedExtras = desiredExtras.map((gap) =>
      desiredExtraTotal > availableExtra && desiredExtraTotal > 0
        ? gap * (availableExtra / desiredExtraTotal)
        : gap
    );
    if (desiredExtraTotal < availableExtra) {
      // Keep unused circumference in the seam's naturally largest empty gap.
      allocatedExtras[allocatedExtras.length - 1] += availableExtra - desiredExtraTotal;
    }

    const relativeCenters = [0];
    for (let index = 1; index < visibleCount; index += 1) {
      relativeCenters[index] = relativeCenters[index - 1]
        + spans[index - 1] / 2
        + panelGapDegrees
        + allocatedExtras[index - 1]
        + spans[index] / 2;
    }
    const rotationOffset = sourceAngles.reduce(
      (sum, angle, index) => sum + angle - relativeCenters[index],
      0
    ) / visibleCount;

    packedOrder.forEach((candidate, index) => {
      const targetAngle = relativeCenters[index] + rotationOffset;
      const span = spans[index];
      packedByInputIndex.set(candidate.originalIndex, {
        sourceAngle: sourceAngles[index],
        targetAngle,
        startAngle: targetAngle - span / 2,
        endAngle: targetAngle + span / 2,
      });
    });
  }

  const occupiedBadges: Array<{ x: number; y: number; radius: number }> = [];
  const layoutsByInputIndex = new Map<number, RelationshipFanLayout>();

  for (const candidate of preparedSources) {
    const {
      source,
      originalIndex,
      sourceAngles,
      visible,
      targetWidths,
      totalTargetArcWidth,
    } = candidate;
    const packed = packedByInputIndex.get(originalIndex);
    const innerRadius = visible ? sharedInnerRadius : chartOuterRadius + attachmentGap;
    const outerRadius = visible ? sharedOuterRadius : innerRadius + fanThickness;
    const fanStartAngle = packed?.startAngle ?? sourceAngles.mid;
    const fanEndAngle = packed?.endAngle ?? sourceAngles.mid;

    const panelStroke = lighterRelationshipColor(source.sourceFill, 4);
    const labelRadius = (innerRadius + outerRadius) / 2;
    const fittedFontSize = Math.max(minimumFanFontSize, fanFontSize);
    const cells: RelationshipFanCellLayout[] = [];

    if (visible) {
      let cursor = fanStartAngle;
      source.targets.forEach((target, targetIndex) => {
        const portion = targetIndex === source.targets.length - 1
          ? fanEndAngle - cursor
          : (fanEndAngle - fanStartAngle) * (
              targetWidths[targetIndex] / Math.max(0.001, totalTargetArcWidth)
            );
        const cellEndAngle = targetIndex === source.targets.length - 1
          ? fanEndAngle
          : cursor + portion;
        const cellMidAngle = (cursor + cellEndAngle) / 2;
        const point = pointOnCircle(centerX, centerY, labelRadius, cellMidAngle);
        const availableLabelWidth = Math.max(
          0,
          ((cellEndAngle - cursor) * Math.PI * labelRadius) / 180 - cellPaddingX * 2
        );
        const availableLabelHeight = Math.max(0, fanThickness - cellPaddingY * 2);
        const measuredAtFittedSize = finite(
          target.measuredTextWidth,
          estimateRelationshipLabelWidth(target.label, fanFontSize)
        ) * (fittedFontSize / fanFontSize);
        const labelBox: RelationshipFanLabelBox = {
          x: point.x,
          y: point.y,
          width: availableLabelWidth,
          height: availableLabelHeight,
          rotation: uprightTangentialRotation(cellMidAngle),
          fontSize: fittedFontSize,
          hidden: availableLabelWidth <= 0
            || availableLabelHeight < fittedFontSize
            || measuredAtFittedSize > availableLabelWidth + 0.5,
        };
        const fill = lighterRelationshipColor(
          source.sourceFillEnd ?? source.sourceFill,
          16 + (targetIndex % 2) * 5
        );
        cells.push({
          targetNodeId: target.targetNodeId,
          label: target.label,
          startAngle: cursor,
          endAngle: cellEndAngle,
          path: annularSectorPath(
            centerX,
            centerY,
            innerRadius,
            outerRadius,
            cursor,
            cellEndAngle
          ),
          fill,
          stroke: panelStroke,
          labelBox,
        });
        includeArc(bounds, centerX, centerY, outerRadius, cursor, cellEndAngle, 1.5);
        includeRotatedRectangle(bounds, labelBox);
        cursor = cellEndAngle;
      });
    }

    const connectorSourceAngle = packed?.sourceAngle ?? sourceAngles.mid;
    const connectorTargetAngle = packed?.targetAngle ?? sourceAngles.mid;
    const connectorInnerRadius = chartOuterRadius + 2;
    const connectorOuterRadius = Math.max(connectorInnerRadius, innerRadius - 2);
    const leaderGeometry = visible
      ? polarLeaderGeometry(
          centerX,
          centerY,
          connectorInnerRadius,
          connectorOuterRadius,
          connectorSourceAngle,
          connectorTargetAngle
        )
      : null;
    const attachmentPath = leaderGeometry?.path ?? null;
    leaderGeometry?.points.forEach((point) => includePoint(bounds, point, 3.5));

    const showBadge = source.showCountBadge !== false && source.targets.length > 0;
    const badgePositionRadius = clamp(
      source.outerRadius - badgeRadius - 4,
      source.innerRadius + badgeRadius + 2,
      Math.max(source.innerRadius + badgeRadius + 2, chartOuterRadius - badgeRadius - 4)
    );
    let resolvedBadgeRadius = badgePositionRadius;
    let resolvedBadgeSize = badgeRadius;
    let badgePoint = pointOnCircle(centerX, centerY, resolvedBadgeRadius, sourceAngles.mid);
    const badgeOverlaps = (point: Point, radius: number) => occupiedBadges.some((candidate) =>
      Math.hypot(point.x - candidate.x, point.y - candidate.y)
        < radius + candidate.radius + 3
    );
    if (badgeOverlaps(badgePoint, resolvedBadgeSize)) {
      const minimumBadgeRadius = source.innerRadius + badgeRadius + 2;
      let candidateRadius = resolvedBadgeRadius - (badgeRadius * 2 + 4);
      while (candidateRadius >= minimumBadgeRadius) {
        const candidatePoint = pointOnCircle(centerX, centerY, candidateRadius, sourceAngles.mid);
        if (!badgeOverlaps(candidatePoint, resolvedBadgeSize)) {
          resolvedBadgeRadius = candidateRadius;
          badgePoint = candidatePoint;
          break;
        }
        candidateRadius -= badgeRadius * 2 + 4;
      }
    }
    if (badgeOverlaps(badgePoint, resolvedBadgeSize)) {
      // Stay inside the chart and compact the badge before accepting a local
      // overlap. Never create another protruding outer layer for badges.
      for (let candidateSize = badgeRadius - 1; candidateSize >= 7; candidateSize -= 1) {
        const candidateRadius = clamp(
          source.outerRadius - candidateSize - 4,
          source.innerRadius + candidateSize + 2,
          Math.max(source.innerRadius + candidateSize + 2, chartOuterRadius - candidateSize - 4)
        );
        const candidatePoint = pointOnCircle(centerX, centerY, candidateRadius, sourceAngles.mid);
        if (!badgeOverlaps(candidatePoint, candidateSize)) {
          resolvedBadgeSize = candidateSize;
          resolvedBadgeRadius = candidateRadius;
          badgePoint = candidatePoint;
          break;
        }
      }
    }
    const badgeFill = lighterRelationshipColor(source.sourceFill, 10);
    const countBadge: RelationshipFanCountBadgeLayout | null = showBadge ? {
      x: badgePoint.x,
      y: badgePoint.y,
      radius: resolvedBadgeSize,
      count: source.targets.length,
      fill: badgeFill,
      stroke: panelStroke,
      textColor: textColorFor(badgeFill),
    } : null;
    if (countBadge) {
      occupiedBadges.push({ ...badgePoint, radius: resolvedBadgeSize });
      includePoint(bounds, badgePoint, resolvedBadgeSize + 2);
    }

    layoutsByInputIndex.set(originalIndex, {
      id: `${source.relationType}:${source.sourceNodeId}`,
      sourceNodeId: source.sourceNodeId,
      relationType: source.relationType,
      count: source.targets.length,
      visible,
      lane: 0,
      startAngle: fanStartAngle,
      endAngle: fanEndAngle,
      innerRadius,
      outerRadius,
      attachmentPath,
      attachmentStroke: panelStroke,
      connectorSourceAngle,
      connectorTargetAngle,
      connectorInnerRadius,
      connectorOuterRadius,
      cells,
      countBadge,
    });
  }

  const paddedBounds = finalizedBounds({
    minX: bounds.minX - boundsPadding,
    minY: bounds.minY - boundsPadding,
    maxX: bounds.maxX + boundsPadding,
    maxY: bounds.maxY + boundsPadding,
  });
  const fans = preparedSources
    .map((candidate) => layoutsByInputIndex.get(candidate.originalIndex))
    .filter((layout): layout is RelationshipFanLayout => !!layout);

  return {
    fans,
    bounds: paddedBounds,
    insets: {
      top: Math.max(0, baseBounds.minY - paddedBounds.minY),
      right: Math.max(0, paddedBounds.maxX - baseBounds.maxX),
      bottom: Math.max(0, paddedBounds.maxY - baseBounds.maxY),
      left: Math.max(0, baseBounds.minX - paddedBounds.minX),
    },
  };
}
