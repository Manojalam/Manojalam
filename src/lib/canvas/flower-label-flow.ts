export type FlowerLabelFlowDensity = "compact" | "comfortable" | "spacious";

export type FlowerLabelMeasureText = (value: string, fontSize: number) => number;

export interface FlowerLabelFlowInput {
  sourceText: string;
  targetLabels: readonly string[];
  /** Width and height of the safe, centered area inside the already-designed petal. */
  regionWidth: number;
  regionHeight: number;
  sourceFontSize: number;
  targetFontSize: number;
  minimumSourceFontSize?: number;
  minimumTargetFontSize?: number;
  density?: FlowerLabelFlowDensity;
  /** Optional browser-backed measurer. The deterministic fallback is suitable for SSR. */
  measureText?: FlowerLabelMeasureText;
}

export interface FlowerLabelPlacement {
  targetIndex: number;
  rowIndex: number;
  /** Coordinates are relative to the center of the supplied region. */
  bulletX: number;
  labelX: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
}

export interface FlowerLabelRow {
  index: number;
  y: number;
  width: number;
  height: number;
  availableWidth: number;
  targetIndexes: number[];
}

export interface FlowerSourceLabelPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
}

export interface FlowerLabelFlowResult {
  source: FlowerSourceLabelPlacement;
  divider: { x1: number; x2: number; y: number };
  targets: FlowerLabelPlacement[];
  rows: FlowerLabelRow[];
  /** Bounds of the compact label cluster, relative to the region center. */
  bounds: { left: number; top: number; right: number; bottom: number };
  targetFontSize: number;
  overflowed: boolean;
}

interface DensityMetrics {
  horizontalPadding: number;
  verticalPadding: number;
  itemGap: number;
  rowGap: number;
  bulletWidth: number;
  sourceToDivider: number;
  dividerToTargets: number;
}

interface TargetItem {
  targetIndex: number;
  boxWidth: number;
  labelWidth: number;
  height: number;
  lines: string[];
}

interface RowPartition {
  items: TargetItem[];
  width: number;
  height: number;
}

const DENSITY_METRICS: Record<FlowerLabelFlowDensity, DensityMetrics> = {
  compact: {
    horizontalPadding: 14,
    verticalPadding: 12,
    itemGap: 9,
    rowGap: 4,
    bulletWidth: 12,
    sourceToDivider: 6,
    dividerToTargets: 8,
  },
  comfortable: {
    horizontalPadding: 18,
    verticalPadding: 16,
    itemGap: 13,
    rowGap: 6,
    bulletWidth: 14,
    sourceToDivider: 8,
    dividerToTargets: 10,
  },
  spacious: {
    horizontalPadding: 22,
    verticalPadding: 20,
    itemGap: 17,
    rowGap: 9,
    bulletWidth: 16,
    sourceToDivider: 10,
    dividerToTargets: 13,
  },
};

const EPSILON = 0.001;

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, value as number) : fallback;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

type SegmenterConstructor = new (
  locales?: string | readonly string[],
  options?: { granularity: "grapheme" }
) => { segment(value: string): Iterable<unknown> };

function graphemeCount(value: string): number {
  const SegmenterCtor = typeof Intl === "undefined"
    ? undefined
    : (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (SegmenterCtor) {
    return Array.from(
      new SegmenterCtor(undefined, { granularity: "grapheme" }).segment(value)
    ).length;
  }
  return Array.from(value).length;
}

/** Deterministic SSR-safe estimate matching the diagram's SVG fallback. */
export function estimateFlowerLabelTextWidth(value: string, fontSize: number): number {
  return graphemeCount(value) * finitePositive(fontSize, 12) * 0.62;
}

function measuredWidth(
  value: string,
  fontSize: number,
  measureText: FlowerLabelMeasureText
): number {
  const measured = measureText(value, fontSize);
  return Number.isFinite(measured) ? Math.max(0, measured) : 0;
}

function wrapLabel(
  value: string,
  maximumWidth: number,
  fontSize: number,
  measureText: FlowerLabelMeasureText
): { lines: string[]; overflowed: boolean } {
  const normalized = normalizeText(value);
  if (!normalized) return { lines: [], overflowed: false };
  if (measuredWidth(normalized, fontSize, measureText) <= maximumWidth + EPSILON) {
    return { lines: [normalized], overflowed: false };
  }

  const words = normalized.split(" ");
  if (words.length === 1) return { lines: [normalized], overflowed: true };

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measuredWidth(candidate, fontSize, measureText) > maximumWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return {
    lines,
    overflowed: lines.some((item) => measuredWidth(item, fontSize, measureText) > maximumWidth + EPSILON),
  };
}

/**
 * Width of a horizontal band inside the canonical petal's guaranteed circular
 * label region. Using the whole row band (not just its center) keeps text off
 * the safe-region edge.
 */
export function flowerLabelAvailableWidth(
  regionWidth: number,
  regionHeight: number,
  y: number,
  rowHeight = 0
): number {
  const width = finitePositive(regionWidth, 1);
  const height = finitePositive(regionHeight, 1);
  const halfHeight = height / 2;
  const outerY = Math.min(halfHeight, Math.abs(y) + Math.max(0, rowHeight) / 2);
  const normalizedY = outerY / halfHeight;
  return width * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
}

function targetItems(
  labels: readonly string[],
  fontSize: number,
  maximumRowWidth: number,
  metrics: DensityMetrics,
  measureText: FlowerLabelMeasureText
): { items: TargetItem[]; overflowed: boolean } {
  const lineHeight = Math.max(11, fontSize * 1.24);
  const maximumItemWidth = Math.max(1, maximumRowWidth * 0.88);
  let overflowed = false;
  const items = labels.map((label, targetIndex) => {
    const normalized = normalizeText(label);
    const naturalLabelWidth = measuredWidth(normalized, fontSize, measureText);
    const labelWidth = Math.max(
      1,
      Math.min(maximumItemWidth - metrics.bulletWidth, naturalLabelWidth)
    );
    const wrapped = wrapLabel(normalized, labelWidth, fontSize, measureText);
    // A target is intentionally at most two lines; a smaller font is tried
    // before allowing a single label to turn the petal back into a tall card.
    overflowed ||= wrapped.overflowed || wrapped.lines.length > 2;
    const lines = wrapped.lines.slice(0, 2);
    const widestLine = Math.max(
      0,
      ...lines.map((line) => measuredWidth(line, fontSize, measureText))
    );
    const boxWidth = Math.min(
      maximumItemWidth,
      Math.max(metrics.bulletWidth + 8, metrics.bulletWidth + widestLine)
    );
    return {
      targetIndex,
      boxWidth,
      labelWidth: Math.max(1, boxWidth - metrics.bulletWidth),
      height: Math.max(lineHeight, lines.length * lineHeight),
      lines,
    };
  });
  return { items, overflowed };
}

function rowWidth(items: readonly TargetItem[], gap: number): number {
  return items.reduce((sum, item) => sum + item.boxWidth, 0)
    + Math.max(0, items.length - 1) * gap;
}

/**
 * Split ordered labels into centered rows. This is an ordered-flow problem,
 * not a column assignment: row membership follows each label's actual width.
 */
function partitionIntoRows(
  items: readonly TargetItem[],
  capacities: readonly number[],
  gap: number
): RowPartition[] | null {
  if (!items.length) return [];
  const rowCount = capacities.length;
  if (rowCount <= 0 || rowCount > items.length) return null;

  type MemoValue = { cost: number; rows: RowPartition[] } | null;
  const memo = new Map<string, MemoValue>();
  const visit = (itemIndex: number, rowIndex: number): MemoValue => {
    const key = `${itemIndex}:${rowIndex}`;
    if (memo.has(key)) return memo.get(key) ?? null;
    if (rowIndex === rowCount) return itemIndex === items.length ? { cost: 0, rows: [] } : null;

    const remainingRows = rowCount - rowIndex - 1;
    const maximumEnd = items.length - remainingRows;
    let best: Exclude<MemoValue, null> | null = null;
    for (let end = itemIndex + 1; end <= maximumEnd; end += 1) {
      const rowItems = items.slice(itemIndex, end);
      const width = rowWidth(rowItems, gap);
      const capacity = capacities[rowIndex];
      if (width > capacity + EPSILON) break;
      const remainder = visit(end, rowIndex + 1);
      if (!remainder) continue;
      const slackRatio = Math.max(0, capacity - width) / Math.max(1, capacity);
      const cost = remainder.cost + slackRatio * slackRatio;
      if (!best || cost < best.cost) {
        best = {
          cost,
          rows: [{
            items: [...rowItems],
            width,
            height: Math.max(...rowItems.map((item) => item.height)),
          }, ...remainder.rows],
        };
      }
    }
    memo.set(key, best);
    return best;
  };

  return visit(0, 0)?.rows ?? null;
}

function fontSizes(preferred: number, minimum: number): number[] {
  const start = Math.max(minimum, Math.round(preferred * 2) / 2);
  const values: number[] = [];
  for (let value = start; value >= minimum - EPSILON; value -= 0.5) {
    values.push(Math.max(minimum, Math.round(value * 2) / 2));
  }
  return [...new Set(values)];
}

interface LayoutAttempt {
  sourceFontSize: number;
  sourceLines: string[];
  sourceLineHeight: number;
  rows: RowPartition[];
  rowCenters: number[];
  capacities: number[];
  targetFontSize: number;
  overflowed: boolean;
  clusterHeight: number;
  sourceY: number;
  dividerY: number;
}

function attemptFlow(
  input: FlowerLabelFlowInput,
  innerWidth: number,
  innerHeight: number,
  metrics: DensityMetrics,
  sourceFontSize: number,
  targetFontSize: number,
  measureText: FlowerLabelMeasureText,
  permitOverflow = false
): LayoutAttempt | null {
  const sourceLineHeight = Math.max(14, sourceFontSize * 1.3);
  const sourceWrap = wrapLabel(input.sourceText, innerWidth * 0.86, sourceFontSize, measureText);
  if (!permitOverflow && (sourceWrap.overflowed || sourceWrap.lines.length > 2)) return null;
  const sourceLines = sourceWrap.lines.slice(0, 2);
  const sourceHeight = Math.max(sourceLineHeight, sourceLines.length * sourceLineHeight);
  const built = targetItems(
    input.targetLabels,
    targetFontSize,
    innerWidth,
    metrics,
    measureText
  );
  if (!permitOverflow && built.overflowed) return null;

  if (!built.items.length) {
    const clusterHeight = sourceHeight;
    if (!permitOverflow && clusterHeight > innerHeight) return null;
    return {
      sourceFontSize,
      sourceLines,
      sourceLineHeight,
      rows: [],
      rowCenters: [],
      capacities: [],
      targetFontSize,
      overflowed: sourceWrap.overflowed,
      clusterHeight,
      sourceY: 0,
      dividerY: sourceHeight / 2 + metrics.sourceToDivider,
    };
  }

  const maximumTargetHeight = Math.max(...built.items.map((item) => item.height));
  for (let rowCount = 1; rowCount <= built.items.length; rowCount += 1) {
    const targetHeight = rowCount * maximumTargetHeight
      + (rowCount - 1) * metrics.rowGap;
    const clusterHeight = sourceHeight
      + metrics.sourceToDivider
      + 1
      + metrics.dividerToTargets
      + targetHeight;
    if (!permitOverflow && clusterHeight > innerHeight + EPSILON) break;

    const top = -clusterHeight / 2;
    const sourceY = top + sourceHeight / 2;
    const dividerY = top + sourceHeight + metrics.sourceToDivider;
    const targetsTop = dividerY + 1 + metrics.dividerToTargets;
    const rowCenters = Array.from({ length: rowCount }, (_, rowIndex) =>
      targetsTop + maximumTargetHeight / 2 + rowIndex * (maximumTargetHeight + metrics.rowGap)
    );
    const capacities = rowCenters.map((y) => permitOverflow
      ? innerWidth
      : Math.min(
          innerWidth,
          flowerLabelAvailableWidth(innerWidth, innerHeight, y, maximumTargetHeight)
        ));
    const rows = partitionIntoRows(built.items, capacities, metrics.itemGap);
    if (!rows) continue;

    return {
      sourceFontSize,
      sourceLines,
      sourceLineHeight,
      rows,
      rowCenters,
      capacities,
      targetFontSize,
      overflowed: built.overflowed || sourceWrap.overflowed,
      clusterHeight,
      sourceY,
      dividerY,
    };
  }
  return null;
}

/**
 * Arrange a source and its targets as a compact, centered typographic cluster
 * inside an existing flower petal. Targets flow naturally from left to right
 * into centered rows according to their measured widths; no column or table
 * structure is imposed.
 */
export function layoutFlowerLabels(input: FlowerLabelFlowInput): FlowerLabelFlowResult {
  const density = input.density ?? "comfortable";
  const metrics = DENSITY_METRICS[density] ?? DENSITY_METRICS.comfortable;
  const regionWidth = finitePositive(input.regionWidth, 240);
  const regionHeight = finitePositive(input.regionHeight, 180);
  const innerWidth = Math.max(1, regionWidth - metrics.horizontalPadding * 2);
  const innerHeight = Math.max(1, regionHeight - metrics.verticalPadding * 2);
  const preferredSourceSize = finitePositive(input.sourceFontSize, 15);
  const preferredTargetSize = finitePositive(input.targetFontSize, 12);
  const minimumSourceSize = Math.min(
    preferredSourceSize,
    finitePositive(input.minimumSourceFontSize, 10)
  );
  const minimumTargetSize = Math.min(
    preferredTargetSize,
    finitePositive(input.minimumTargetFontSize, 9)
  );
  const measureText = input.measureText ?? estimateFlowerLabelTextWidth;

  let attempt: LayoutAttempt | null = null;
  for (const targetSize of fontSizes(preferredTargetSize, minimumTargetSize)) {
    // Keep the source visually dominant, but allow it to adapt independently
    // when a long source name competes with a dense target cluster.
    const desiredSourceSize = Math.min(
      preferredSourceSize,
      Math.max(minimumSourceSize, targetSize * 1.24)
    );
    for (const sourceSize of fontSizes(desiredSourceSize, minimumSourceSize)) {
      attempt = attemptFlow(
        input,
        innerWidth,
        innerHeight,
        metrics,
        sourceSize,
        targetSize,
        measureText
      );
      if (attempt) break;
    }
    if (attempt) break;
  }

  // Give the caller finite placements even when the fixed canonical region is
  // too small. The petal remains unchanged and `overflowed` is explicit.
  attempt ??= attemptFlow(
    input,
    innerWidth,
    Number.POSITIVE_INFINITY,
    metrics,
    minimumSourceSize,
    minimumTargetSize,
    measureText,
    true
  );

  // The fallback above always succeeds for finite labels and positive width.
  if (!attempt) {
    throw new Error("Unable to lay out flower labels");
  }

  const sourceWidth = Math.min(
    innerWidth * 0.86,
    Math.max(
      1,
      ...attempt.sourceLines.map((line) => measuredWidth(line, attempt!.sourceFontSize, measureText))
    )
  );
  const sourceHeight = Math.max(
    attempt.sourceLineHeight,
    attempt.sourceLines.length * attempt.sourceLineHeight
  );
  const targets: FlowerLabelPlacement[] = [];
  const rows: FlowerLabelRow[] = [];

  attempt.rows.forEach((row, rowIndex) => {
    const y = attempt!.rowCenters[rowIndex];
    let cursor = -row.width / 2;
    row.items.forEach((item) => {
      targets.push({
        targetIndex: item.targetIndex,
        rowIndex,
        bulletX: cursor + metrics.bulletWidth * 0.32,
        labelX: cursor + metrics.bulletWidth,
        y,
        width: item.labelWidth,
        height: item.height,
        fontSize: attempt!.targetFontSize,
        lineHeight: Math.max(11, attempt!.targetFontSize * 1.24),
        lines: item.lines,
      });
      cursor += item.boxWidth + metrics.itemGap;
    });
    rows.push({
      index: rowIndex,
      y,
      width: row.width,
      height: row.height,
      availableWidth: attempt!.capacities[rowIndex],
      targetIndexes: row.items.map((item) => item.targetIndex),
    });
  });

  const clusterWidths = [sourceWidth, ...rows.map((row) => row.width)];
  const widest = Math.max(1, ...clusterWidths);
  const bounds = {
    left: -widest / 2,
    top: -attempt.clusterHeight / 2,
    right: widest / 2,
    bottom: attempt.clusterHeight / 2,
  };
  const dividerWidth = Math.min(innerWidth * 0.72, Math.max(sourceWidth + 12, widest * 0.7));
  const overflowed = attempt.overflowed
    || bounds.top < -innerHeight / 2 - EPSILON
    || bounds.bottom > innerHeight / 2 + EPSILON
    || rows.some((row) => row.width > row.availableWidth + EPSILON);

  return {
    source: {
      x: 0,
      y: attempt.sourceY,
      width: sourceWidth,
      height: sourceHeight,
      fontSize: attempt.sourceFontSize,
      lineHeight: attempt.sourceLineHeight,
      lines: attempt.sourceLines,
    },
    divider: {
      x1: -dividerWidth / 2,
      x2: dividerWidth / 2,
      y: attempt.dividerY,
    },
    targets,
    rows,
    bounds,
    targetFontSize: attempt.targetFontSize,
    overflowed,
  };
}
