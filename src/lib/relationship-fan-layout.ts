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
  attachmentFill: string;
  attachmentStroke: string;
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
  laneGap?: number;
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
const DEFAULT_LANE_GAP = 8;
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

function intervalsOverlap(
  first: { start: number; end: number },
  second: { start: number; end: number },
  gap: number
): boolean {
  for (const shift of [-360, 0, 360]) {
    const shiftedStart = second.start + shift;
    const shiftedEnd = second.end + shift;
    if (first.start - gap < shiftedEnd && first.end + gap > shiftedStart) return true;
  }
  return false;
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
  const laneGap = Math.max(0, finite(options.laneGap, DEFAULT_LANE_GAP));
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

  const orderedSources = sources
    .map((source, originalIndex) => {
      const angles = unwrappedAngles(source.startAngle, source.endAngle);
      return { source, originalIndex, angles };
    })
    .filter(({ source }) => source.targets.length > 0)
    .sort((first, second) => {
      const firstMid = ((first.angles.mid % 360) + 360) % 360;
      const secondMid = ((second.angles.mid % 360) + 360) % 360;
      return firstMid - secondMid || first.originalIndex - second.originalIndex;
    });
  if (!orderedSources.length) {
    return {
      fans: [],
      bounds: finalizedBounds({ ...baseBounds }),
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }
  const occupiedPanels: Array<{
    start: number;
    end: number;
    innerRadius: number;
    outerRadius: number;
  }> = [];
  const occupiedBadges: Array<{ x: number; y: number; radius: number }> = [];
  const layoutsByInputIndex = new Map<number, RelationshipFanLayout>();

  for (const { source, originalIndex, angles: sourceAngles } of orderedSources) {
    const visible = source.visible !== false;
    const targetWidths = source.targets.map((target) => {
      const measured = finite(
        target.measuredTextWidth,
        estimateRelationshipLabelWidth(target.label, fanFontSize)
      );
      return Math.max(minimumCellArcWidth, measured + cellPaddingX * 2);
    });
    const totalTargetArcWidth = targetWidths.reduce((sum, width) => sum + width, 0);
    const sourceSpan = sourceAngles.end - sourceAngles.start;
    let lane = 0;
    let innerRadius = chartOuterRadius + attachmentGap;
    let outerRadius = innerRadius + fanThickness;
    let fanStartAngle = sourceAngles.mid;
    let fanEndAngle = sourceAngles.mid;

    if (visible) {
      // Grow the fan radius when its labels need more arc length. Keeping the
      // chart radius fixed and shrinking text made larger relationship sets
      // produce blank cells at the minimum font size. Radius is the flexible
      // dimension here, so all labels stay readable at the requested size.
      const maximumFanRadians = Math.max(0.001, maximumFanAngle * Math.PI / 180);
      const contentLabelRadius = totalTargetArcWidth / maximumFanRadians;
      const contentInnerRadius = Math.max(
        chartOuterRadius + attachmentGap,
        contentLabelRadius - fanThickness / 2
      );
      while (true) {
        innerRadius = Math.max(innerRadius, contentInnerRadius);
        outerRadius = innerRadius + fanThickness;
        const labelRadius = (innerRadius + outerRadius) / 2;
        const requiredAngle = (totalTargetArcWidth / Math.max(1, labelRadius)) * (180 / Math.PI);
        const preferredSourceAngle = clamp(sourceSpan, minimumFanAngle, 36);
        const fanAngle = clamp(
          Math.max(minimumFanAngle, preferredSourceAngle, requiredAngle),
          minimumFanAngle,
          maximumFanAngle
        );
        fanStartAngle = sourceAngles.mid - fanAngle / 2;
        fanEndAngle = sourceAngles.mid + fanAngle / 2;
        const interval = { start: fanStartAngle, end: fanEndAngle };
        const collisions = occupiedPanels.filter((candidate) =>
          intervalsOverlap(candidate, interval, collisionGap) &&
          innerRadius - laneGap < candidate.outerRadius &&
          outerRadius + laneGap > candidate.innerRadius
        );
        if (!collisions.length) {
          occupiedPanels.push({ ...interval, innerRadius, outerRadius });
          break;
        }
        innerRadius = Math.max(
          innerRadius + fanThickness + laneGap,
          ...collisions.map((candidate) => candidate.outerRadius + laneGap)
        );
        lane += 1;
      }
    }

    const panelFill = lighterRelationshipColor(source.sourceFill, 19);
    const panelStroke = lighterRelationshipColor(source.sourceFill, 4);
    const labelRadius = (innerRadius + outerRadius) / 2;
    const totalFanArcWidth = ((fanEndAngle - fanStartAngle) * Math.PI * labelRadius) / 180;
    const fontScale = totalTargetArcWidth > 0
      ? Math.min(1, totalFanArcWidth / totalTargetArcWidth)
      : 1;
    const fittedFontSize = Math.max(minimumFanFontSize, fanFontSize * fontScale);
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

    const attachmentHalfAngle = visible
      ? Math.max(0.8, Math.min(sourceSpan / 2, (fanEndAngle - fanStartAngle) / 2, 5))
      : 0;
    const attachmentPath = visible && innerRadius > chartOuterRadius
      ? annularSectorPath(
          centerX,
          centerY,
          chartOuterRadius,
          innerRadius,
          sourceAngles.mid - attachmentHalfAngle,
          sourceAngles.mid + attachmentHalfAngle
        )
      : null;
    if (attachmentPath) {
      includeArc(
        bounds,
        centerX,
        centerY,
        innerRadius,
        sourceAngles.mid - attachmentHalfAngle,
        sourceAngles.mid + attachmentHalfAngle,
        1.5
      );
    }

    const showBadge = source.showCountBadge !== false && source.targets.length > 0;
    const badgePositionRadius = clamp(
      source.outerRadius - badgeRadius - 4,
      source.innerRadius + badgeRadius + 2,
      Math.max(source.innerRadius + badgeRadius + 2, chartOuterRadius - badgeRadius - 4)
    );
    let resolvedBadgeRadius = badgePositionRadius;
    let badgePoint = pointOnCircle(centerX, centerY, resolvedBadgeRadius, sourceAngles.mid);
    const badgeOverlaps = (point: Point) => occupiedBadges.some((candidate) =>
      Math.hypot(point.x - candidate.x, point.y - candidate.y)
        < badgeRadius + candidate.radius + 3
    );
    if (badgeOverlaps(badgePoint)) {
      resolvedBadgeRadius = Math.max(
        chartOuterRadius + badgeRadius + 4,
        visible ? outerRadius + badgeRadius + 4 : chartOuterRadius + badgeRadius + 4
      );
      badgePoint = pointOnCircle(centerX, centerY, resolvedBadgeRadius, sourceAngles.mid);
      let attempts = 0;
      while (badgeOverlaps(badgePoint) && attempts < 24) {
        resolvedBadgeRadius += badgeRadius * 2 + 4;
        badgePoint = pointOnCircle(centerX, centerY, resolvedBadgeRadius, sourceAngles.mid);
        attempts += 1;
      }
    }
    const badgeFill = lighterRelationshipColor(source.sourceFill, 10);
    const countBadge: RelationshipFanCountBadgeLayout | null = showBadge ? {
      x: badgePoint.x,
      y: badgePoint.y,
      radius: badgeRadius,
      count: source.targets.length,
      fill: badgeFill,
      stroke: panelStroke,
      textColor: textColorFor(badgeFill),
    } : null;
    if (countBadge) {
      occupiedBadges.push({ ...badgePoint, radius: badgeRadius });
      includePoint(bounds, badgePoint, badgeRadius + 2);
    }

    layoutsByInputIndex.set(originalIndex, {
      id: `${source.relationType}:${source.sourceNodeId}`,
      sourceNodeId: source.sourceNodeId,
      relationType: source.relationType,
      count: source.targets.length,
      visible,
      lane,
      startAngle: fanStartAngle,
      endAngle: fanEndAngle,
      innerRadius,
      outerRadius,
      attachmentPath,
      attachmentFill: panelFill,
      attachmentStroke: panelStroke,
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
  const fans = Array.from(layoutsByInputIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, layout]) => layout);

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
