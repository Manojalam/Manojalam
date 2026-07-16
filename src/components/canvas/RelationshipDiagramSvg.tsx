import { createContext, useContext, type ReactNode } from "react";

import {
  isTransparentRelationshipDiagramBackground,
  type RelationshipGroup,
} from "@/lib/relationship-diagram";
import {
  buildFlowerPetalGeometry,
  flowerPetalGeometryBounds,
} from "@/lib/canvas/flower-petal-geometry";
import { layoutFlowerLabels, type FlowerLabelFlowResult } from "@/lib/canvas/flower-label-flow";
import { fitRelationshipLabel } from "@/lib/canvas/relationship-label-fit";
import {
  layoutRelationshipFlowerPetals,
  type RelationshipFlowerGeometricPlacement,
  type RelationshipFlowerPetalPlacement,
} from "@/lib/canvas/relationship-flower-layout";
import type {
  RelationshipDiagramItemStyle,
  RelationshipDiagramPalette,
  RelationshipDiagramSpec,
} from "@/lib/types";

type RelationshipDiagramSvgProps = {
  groups: RelationshipGroup[];
  spec: RelationshipDiagramSpec;
  exportId?: string;
  measureText?: boolean;
};

type Point = { x: number; y: number };

const FONT_FAMILY = "var(--font-noto-devanagari), 'Noto Sans Devanagari', Inter, sans-serif";
const DiagramVisualStyleContext = createContext<Pick<
  RelationshipDiagramSpec,
  "fontFamily" | "fontWeight" | "fontStyle" | "textColor" | "maximizeLabelText"
>>({ maximizeLabelText: false });
const PALETTES: Record<Exclude<RelationshipDiagramPalette, "source">, string[]> = {
  spectrum: ["#ef4444", "#f59e0b", "#84cc16", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"],
  warm: ["#b91c1c", "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#be123c"],
  cool: ["#0f766e", "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed"],
  pastel: ["#f9a8d4", "#c4b5fd", "#93c5fd", "#99f6e4", "#bef264", "#fde68a", "#fdba74"],
  monochrome: ["#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"],
};
let measurementCanvas: HTMLCanvasElement | null = null;
const TextMeasurementContext = createContext(false);

function normalizeHex(color: string | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return "#" + trimmed.slice(1).split("").map((digit) => digit + digit).join("");
  }
  return null;
}

function tint(color: string, amount: number): string {
  const normalized = normalizeHex(color);
  if (!normalized) {
    return "color-mix(in srgb, " + color + " " + Math.round((1 - amount) * 100) + "%, white)";
  }
  const hex = normalized;
  const channel = (offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  const mix = (value: number) => Math.round(value + (255 - value) * amount);
  return "#" + [mix(channel(1)), mix(channel(3)), mix(channel(5))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function paletteColor(index: number, palette: RelationshipDiagramPalette): string {
  const colors = palette === "source" ? PALETTES.spectrum : PALETTES[palette];
  return colors[index % colors.length];
}

function groupColor(group: RelationshipGroup, index: number, palette: RelationshipDiagramPalette): string {
  if (palette === "source") {
    return group.sourceColor?.trim() || paletteColor(index, palette);
  }
  return paletteColor(index, palette);
}

function itemStyle(group: RelationshipGroup, spec: RelationshipDiagramSpec): RelationshipDiagramItemStyle {
  return spec.itemStyles?.[group.sourceNodeId] ?? {};
}

function styledGroupColor(
  group: RelationshipGroup,
  index: number,
  spec: RelationshipDiagramSpec
): string {
  return itemStyle(group, spec).fillColor ?? groupColor(group, index, spec.palette);
}

function groupStrokeColor(
  group: RelationshipGroup,
  index: number,
  spec: RelationshipDiagramSpec
): string {
  return itemStyle(group, spec).borderColor ?? spec.borderColor ?? styledGroupColor(group, index, spec);
}

function groupStrokeWidth(spec: RelationshipDiagramSpec): number {
  return Math.max(0, Math.min(16, spec.borderWidth ?? 2));
}

function groupFillOpacity(spec: RelationshipDiagramSpec): number {
  return Math.max(0, Math.min(1, spec.fillOpacity ?? 1));
}

function contrastText(color: string): string {
  const hex = normalizeHex(color);
  if (!hex) return "#0f172a";
  const channel = (offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const luminance = channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
  return luminance < 0.5 ? "#ffffff" : "#0f172a";
}

function polar(cx: number, cy: number, radius: number, angle: number): Point {
  const radians = angle * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function annularPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polar(cx, cy, outerRadius, startAngle);
  const outerEnd = polar(cx, cy, outerRadius, endAngle);
  const innerEnd = polar(cx, cy, innerRadius, endAngle);
  const innerStart = polar(cx, cy, innerRadius, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    "M", outerStart.x, outerStart.y,
    "A", outerRadius, outerRadius, 0, large, 1, outerEnd.x, outerEnd.y,
    "L", innerEnd.x, innerEnd.y,
    "A", innerRadius, innerRadius, 0, large, 0, innerStart.x, innerStart.y,
    "Z",
  ].join(" ");
}

function graphemeCount(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const SegmenterCtor = Intl.Segmenter;
    return Array.from(new SegmenterCtor(undefined, { granularity: "grapheme" }).segment(value)).length;
  }
  return Array.from(value).length;
}

function safeSourceIcon(group: RelationshipGroup, showIcons: boolean): string {
  if (!showIcons) return "";
  const icon = group.sourceIcon?.trim();
  if (!icon || graphemeCount(icon) > 2 || /[\p{L}\p{N}]/u.test(icon)) return "";
  return icon;
}

function sourceDisplayLabel(group: RelationshipGroup, spec: RelationshipDiagramSpec): string {
  const icon = safeSourceIcon(group, spec.showIcons);
  return (icon ? icon + " " : "") + group.sourceLabel;
}

function estimatedTextWidth(value: string, fontSize: number, measureText = false): number {
  if (measureText && typeof document !== "undefined") {
    measurementCanvas ??= document.createElement("canvas");
    const context = measurementCanvas.getContext("2d");
    if (context) {
      context.font = "600 " + fontSize + "px 'Noto Sans Devanagari', Inter, sans-serif";
      return context.measureText(value).width;
    }
  }
  return graphemeCount(value) * fontSize * 0.62;
}

function longestWordWidth(value: string, fontSize: number): number {
  return Math.max(
    0,
    ...value.trim().split(/\s+/u).map((word) => estimatedTextWidth(word, fontSize))
  );
}

function SvgLabel({
  value,
  x,
  y,
  width,
  height,
  fontSize,
  fill = "#0f172a",
  weight = 600,
  anchor = "middle",
  maximumLines = 5,
  lineHeight = 1.35,
  maximumFontSize = 72,
  transform,
  fillOverride,
}: {
  value: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize: number;
  fill?: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  maximumLines?: number;
  lineHeight?: number;
  maximumFontSize?: number;
  transform?: string;
  fillOverride?: string;
}) {
  const measureText = useContext(TextMeasurementContext);
  const visualStyle = useContext(DiagramVisualStyleContext);
  const resolvedFill = fillOverride ?? visualStyle.textColor ?? fill;
  const resolvedWeight = visualStyle.fontWeight === "bold"
    ? 700
    : visualStyle.fontWeight === "normal"
      ? 400
      : weight;
  const fit = fitRelationshipLabel({
    value,
    maximumWidth: width,
    maximumHeight: height,
    preferredFontSize: fontSize,
    maximumFontSize,
    maximumLines,
    minimumFontSize: 9,
    lineHeight,
    maximize: visualStyle.maximizeLabelText === true,
    measureText: (label, size) => estimatedTextWidth(label, size, measureText),
  });
  const offset = -((fit.lines.length - 1) * fit.fontSize * lineHeight) / 2;
  if (fit.overflowed) {
    return (
      <g transform={transform} role="img" aria-label={value}>
        <title>{value}</title>
        <circle cx={x} cy={y} r="9" fill="rgba(255,255,255,0.9)" stroke={resolvedFill} strokeWidth="1.5" />
        <text
          x={x}
          y={y}
          fill={resolvedFill}
          fontFamily={visualStyle.fontFamily ?? FONT_FAMILY}
          fontSize="10"
          fontWeight={resolvedWeight}
          fontStyle={visualStyle.fontStyle}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          i
        </text>
      </g>
    );
  }
  return (
    <g role="img" aria-label={value}>
      <title>{value}</title>
      <text
        x={x}
        y={y + offset}
        fill={resolvedFill}
        fontFamily={visualStyle.fontFamily ?? FONT_FAMILY}
        fontSize={fit.fontSize}
        fontWeight={resolvedWeight}
        fontStyle={visualStyle.fontStyle}
        textAnchor={anchor}
        dominantBaseline="middle"
        transform={transform}
        style={{ whiteSpace: "pre", wordBreak: "keep-all", overflowWrap: "normal" }}
      >
        {fit.lines.map((line, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : fit.fontSize * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function TitleBlock({
  spec,
  width,
  showTitle = true,
}: {
  spec: RelationshipDiagramSpec;
  width: number;
  showTitle?: boolean;
}) {
  const title = showTitle ? spec.title : "";
  if (!title && !spec.subtitle) return null;
  return (
    <g>
      {title && (
        <SvgLabel
          value={title}
          x={width / 2}
          y={30}
          width={width - 64}
          height={36}
          fontSize={Math.max(20, spec.textSize * 1.55)}
          weight={750}
          maximumLines={2}
        />
      )}
      {spec.subtitle && (
        <SvgLabel
          value={spec.subtitle}
          x={width / 2}
          y={title ? 60 : 30}
          width={width - 72}
          height={28}
          fontSize={Math.max(11, spec.textSize * 0.82)}
          fill="#64748b"
          weight={500}
          maximumLines={2}
        />
      )}
    </g>
  );
}

function EmptyDiagram({ spec }: { spec: RelationshipDiagramSpec }) {
  return (
    <g>
      <rect x="24" y="88" width="712" height="428" rx="28" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="8 7" />
      <SvgLabel
        value="No saved relationships in this scope"
        x={380}
        y={280}
        width={620}
        height={80}
        fontSize={Math.max(16, spec.textSize)}
        fill="#64748b"
      />
    </g>
  );
}

const ARC_FAN_START = 110;
const ARC_FAN_END = 430;
const ARC_FAN_RADIANS = (ARC_FAN_END - ARC_FAN_START) * Math.PI / 180;

function arcFanTargetText(group: RelationshipGroup): string {
  return group.targets.map((target) => target.label).join(", ");
}

function arcFanMetrics(groups: RelationshipGroup[], spec: RelationshipDiagramSpec) {
  const maximumTargetCount = Math.max(1, ...groups.map((group) => group.targets.length));
  const targetFontSize = Math.max(11, spec.textSize * 0.92);
  const sourceFontSize = Math.max(12, spec.textSize * 1.05);
  const targetLineHeight = targetFontSize * 1.35;
  const densityAdjustment = spec.density === "compact" ? -1 : spec.density === "spacious" ? 1 : 0;
  const desiredTargetLines = Math.max(
    4,
    Math.min(10, 4 + Math.ceil(Math.sqrt(maximumTargetCount)) + densityAdjustment)
  );
  const hubRadius = Math.max(86, Math.min(116, spec.textSize * 5.8));
  const sourceThickness = Math.max(172, Math.min(236, spec.textSize * 10.5));
  const sourceRadius = hubRadius + sourceThickness;
  const sourceLabelRadius = (hubRadius + sourceRadius) / 2;
  const sourceMaximumLines = Math.max(
    2,
    Math.min(3, Math.floor((sourceThickness - 24) / (sourceFontSize * 1.35)))
  );
  const baseTargetThickness = Math.max(
    196,
    Math.min(372, desiredTargetLines * targetLineHeight + 52)
  );
  let targetRadius = sourceRadius + baseTargetThickness;

  const weightsAtRadius = (labelRadius: number) => groups.map((group) => {
    const targetText = arcFanTargetText(group);
    const targetWidth = estimatedTextWidth(targetText, targetFontSize);
    const sourceText = sourceDisplayLabel(group, spec)
      + (spec.showCounts ? " (" + group.count + ")" : "");
    const sourceWidth = estimatedTextWidth(
      sourceText,
      sourceFontSize
    );
    // Both labels are tangential. Convert the source label's requested arc at
    // its smaller radius to the equivalent request at the crown radius.
    const sourceRequestAtCrown = (
      Math.max(sourceWidth / sourceMaximumLines, longestWordWidth(sourceText, sourceFontSize)) + 24
    ) * labelRadius / sourceLabelRadius;
    const targetRequest = Math.max(
      targetWidth / desiredTargetLines + 30,
      longestWordWidth(targetText, targetFontSize) + 24
    );
    return Math.max(76, sourceRequestAtCrown, targetRequest);
  });

  // Grow the crown when the requested text area exceeds its available arc.
  // The upper bound prevents a malformed or enormous relationship set from
  // producing an unbounded SVG; labels beyond it use the title callout.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const labelRadius = (sourceRadius + targetRadius) / 2;
    const totalRequestedArc = weightsAtRadius(labelRadius).reduce((sum, width) => sum + width, 0);
    const requiredLabelRadius = totalRequestedArc * 1.12 / ARC_FAN_RADIANS;
    if (requiredLabelRadius <= labelRadius) break;
    targetRadius = Math.min(860, targetRadius + (requiredLabelRadius - labelRadius) * 2);
  }

  const labelRadius = (sourceRadius + targetRadius) / 2;
  const groupWeights = weightsAtRadius(labelRadius);
  const targetMaximumLines = Math.max(
    1,
    Math.floor((targetRadius - sourceRadius - 30) / targetLineHeight)
  );
  const size = Math.ceil(targetRadius * 2 + 96);
  return {
    width: size,
    height: size,
    cx: size / 2,
    cy: size / 2,
    hubRadius,
    sourceRadius,
    targetRadius,
    sourceFontSize,
    sourceMaximumLines,
    targetFontSize,
    targetMaximumLines,
    groupWeights,
  };
}

function ArcFanLayout({ groups, spec }: RelationshipDiagramSvgProps) {
  const metrics = arcFanMetrics(groups, spec);
  const {
    width,
    cx,
    cy,
    hubRadius,
    sourceRadius,
    targetRadius,
    sourceFontSize,
    sourceMaximumLines,
    targetFontSize,
    targetMaximumLines,
    groupWeights,
  } = metrics;
  if (!groups.length) return <><TitleBlock spec={spec} width={width} /><EmptyDiagram spec={spec} /></>;
  // Leave a small opening at the bottom so this remains a fan rather than a
  // second sunburst chart. Every group's targets stay in its own crown panel.
  const totalWeight = groupWeights.reduce((sum, weight) => sum + weight, 0);
  let cursor = ARC_FAN_START;
  const pieces: ReactNode[] = [];

  groups.forEach((group, groupIndex) => {
    const color = styledGroupColor(group, groupIndex, spec);
    const style = itemStyle(group, spec);
    const stroke = groupStrokeColor(group, groupIndex, spec);
    const span = (ARC_FAN_END - ARC_FAN_START) * (groupWeights[groupIndex] / totalWeight);
    const gap = Math.min(groups.length > 12 ? 0.5 : 0.9, span * 0.18);
    const sourceStart = cursor + gap / 2;
    const sourceEnd = cursor + span - gap / 2;
    const sourceMid = (sourceStart + sourceEnd) / 2;
    pieces.push(
      <path
        key={"source-" + group.sourceNodeId}
        d={annularPath(cx, cy, hubRadius, sourceRadius, sourceStart, sourceEnd)}
        fill={color}
        fillOpacity={groupFillOpacity(spec)}
        stroke={spec.borderColor || style.borderColor ? stroke : "#ffffff"}
        strokeWidth={groupStrokeWidth(spec)}
      />
    );
    const sourceLabelRadius = (hubRadius + sourceRadius) / 2;
    const sourcePoint = polar(cx, cy, sourceLabelRadius, sourceMid);
    const sourceArcWidth = Math.max(
      28,
      (sourceEnd - sourceStart) * Math.PI / 180 * sourceLabelRadius - 16
    );
    let sourceRotation = sourceMid + 90;
    while (sourceRotation > 180) sourceRotation -= 360;
    if (sourceRotation > 90) sourceRotation -= 180;
    if (sourceRotation < -90) sourceRotation += 180;
    pieces.push(
      <SvgLabel
        key={"source-label-" + group.sourceNodeId}
        value={sourceDisplayLabel(group, spec) + (spec.showCounts ? " (" + group.count + ")" : "")}
        x={sourcePoint.x}
        y={sourcePoint.y}
        width={sourceArcWidth}
        height={sourceRadius - hubRadius - 24}
        fontSize={style.fontSize ?? sourceFontSize}
        fill={contrastText(color)}
        fillOverride={style.textColor}
        weight={750}
        maximumLines={sourceMaximumLines}
        transform={"rotate(" + sourceRotation + " " + sourcePoint.x + " " + sourcePoint.y + ")"}
      />
    );

    pieces.push(
      <path
        key={"target-panel-" + group.sourceNodeId}
        d={annularPath(cx, cy, sourceRadius, targetRadius, sourceStart, sourceEnd)}
        fill={tint(color, 0.76)}
        fillOpacity={groupFillOpacity(spec)}
        stroke={spec.borderColor || style.borderColor ? stroke : tint(color, 0.14)}
        strokeWidth={groupStrokeWidth(spec)}
      />
    );
    const labelRadius = (sourceRadius + targetRadius) / 2;
    const labelPoint = polar(cx, cy, labelRadius, sourceMid);
    let targetRotation = sourceMid + 90;
    while (targetRotation > 180) targetRotation -= 360;
    if (targetRotation > 90) targetRotation -= 180;
    if (targetRotation < -90) targetRotation += 180;
    const targetArcWidth = Math.max(
      28,
      (sourceEnd - sourceStart) * Math.PI / 180 * labelRadius - 18
    );
    const targetText = arcFanTargetText(group);
    pieces.push(
      <SvgLabel
        key={"target-list-" + group.sourceNodeId}
        value={targetText}
        x={labelPoint.x}
        y={labelPoint.y}
        width={targetArcWidth}
        height={targetRadius - sourceRadius - 30}
        fontSize={style.fontSize ? Math.max(9, style.fontSize * 0.9) : targetFontSize}
        fillOverride={style.textColor}
        weight={600}
        maximumLines={targetMaximumLines}
        transform={"rotate(" + targetRotation + " " + labelPoint.x + " " + labelPoint.y + ")"}
      />
    );
    cursor += span;
  });

  return (
    <>
      {pieces}
      <circle
        cx={cx}
        cy={cy}
        r={hubRadius}
        fill={spec.centerFillColor ?? "#0f172a"}
        stroke={spec.centerBorderColor ?? "#ffffff"}
        strokeWidth={spec.centerBorderWidth ?? 4}
      />
      <SvgLabel
        value={spec.title || "Relationships"}
        x={cx}
        y={cy}
        width={hubRadius * 1.55}
        height={hubRadius * 1.45}
        fontSize={Math.max(12, spec.textSize * 0.9)}
        fillOverride={spec.centerTextColor ?? "#ffffff"}
        weight={750}
        maximumLines={3}
      />
      {spec.subtitle && (
        <SvgLabel
          value={spec.subtitle}
          x={cx}
          y={cy + hubRadius + 26}
          width={Math.max(220, hubRadius * 3)}
          height={32}
          fontSize={Math.max(10, spec.textSize * 0.72)}
          fill="#64748b"
          weight={500}
          maximumLines={2}
        />
      )}
    </>
  );
}

type FlowerPetalMetric = RelationshipFlowerPetalPlacement & {
  flow: FlowerLabelFlowResult;
};

function flowerPetalGeometry(
  petal: RelationshipFlowerGeometricPlacement,
  center: Point
) {
  return buildFlowerPetalGeometry({
    center,
    angleDegrees: petal.angle,
    rootRadius: petal.rootRadius,
    length: petal.length,
    halfWidth: petal.halfWidth,
    labelCenterOffset: petal.labelCenterRadius - petal.rootRadius,
    labelRegionRadius: petal.labelRegionRadius,
    sectorHalfAngleDegrees: petal.sectorHalfAngleDegrees,
    edgeClearance: petal.edgeClearance,
    baseContact: petal.baseContact,
  });
}

function flowerMetrics(groups: RelationshipGroup[], spec: RelationshipDiagramSpec) {
  const hubRadius = Math.max(92, Math.min(112, spec.textSize * 5.4));
  const layout = layoutRelationshipFlowerPetals(groups.map((group) => ({
    preferredLayer: itemStyle(group, spec).flowerLayer,
  })), {
    hubRadius,
    maxPerLayer: spec.flowerPetalsPerLayer,
    density: spec.density,
    layerCount: spec.flowerLayerCount,
  });
  const flowDensity = spec.density === "spacious" ? "comfortable" : "compact";
  const petals: FlowerPetalMetric[] = layout.petals.map((placement) => {
    const group = groups[placement.index];
    const style = itemStyle(group, spec);
    const baseFontSize = style.fontSize ?? spec.textSize;
    const sourceFontSize = Math.max(10, baseFontSize * 0.9);
    const targetFontSize = Math.max(8, baseFontSize * 0.68);
    return {
      ...placement,
      flow: layoutFlowerLabels({
        sourceText: sourceDisplayLabel(group, spec)
          + (spec.showCounts ? " (" + group.count + ")" : ""),
        targetLabels: group.targets.map((target) => target.label),
        regionWidth: placement.labelRegionRadius * 2,
        regionHeight: placement.labelRegionRadius * 2,
        sourceFontSize,
        targetFontSize,
        minimumSourceFontSize: 8.5,
        minimumTargetFontSize: 7,
        density: flowDensity,
        maximizeFontSize: spec.maximizeLabelText,
      }),
    };
  });
  const actualExtent = petals.reduce((maximum, petal, index) => {
    const geometry = flowerPetalGeometry(petal, { x: 0, y: 0 });
    const bounds = flowerPetalGeometryBounds(
      geometry,
      geometry.profile.root,
      itemStyle(groups[index], spec).rotation ?? 0
    );
    return Math.max(
      maximum,
      Math.abs(bounds.minX),
      Math.abs(bounds.minY),
      Math.abs(bounds.maxX),
      Math.abs(bounds.maxY)
    );
  }, hubRadius);
  const outlineExtent = layout.emptyPetals.reduce((maximum, petal) => {
    const geometry = flowerPetalGeometry(petal, { x: 0, y: 0 });
    const bounds = flowerPetalGeometryBounds(geometry, geometry.profile.root);
    return Math.max(
      maximum,
      Math.abs(bounds.minX),
      Math.abs(bounds.minY),
      Math.abs(bounds.maxX),
      Math.abs(bounds.maxY)
    );
  }, actualExtent);
  const size = Math.max(640, Math.ceil((outlineExtent + 36) * 2));
  return {
    width: size,
    height: size,
    hubRadius,
    petals,
    emptyPetals: layout.emptyPetals,
    layerSlotCount: layout.layerSlotCount,
  };
}

function SvgTextLines({
  value,
  lines,
  x,
  y,
  fontSize,
  lineHeight,
  fill = "#0f172a",
  weight = 600,
  anchor = "middle",
  fillOverride,
}: {
  value: string;
  lines: readonly string[];
  x: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  fill?: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  fillOverride?: string;
}) {
  const visualStyle = useContext(DiagramVisualStyleContext);
  const resolvedFill = fillOverride ?? visualStyle.textColor ?? fill;
  const resolvedWeight = visualStyle.fontWeight === "bold"
    ? 700
    : visualStyle.fontWeight === "normal"
      ? 400
      : weight;
  const offset = -((lines.length - 1) * lineHeight) / 2;
  return (
    <g role="img" aria-label={value}>
      <title>{value}</title>
      <text
        x={x}
        y={y + offset}
        fill={resolvedFill}
        fontFamily={visualStyle.fontFamily ?? FONT_FAMILY}
        fontSize={fontSize}
        fontWeight={resolvedWeight}
        fontStyle={visualStyle.fontStyle}
        textAnchor={anchor}
        dominantBaseline="middle"
        style={{ whiteSpace: "pre", wordBreak: "keep-all", overflowWrap: "normal" }}
      >
        {lines.map((line, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function FlowerLayout({ groups, spec }: RelationshipDiagramSvgProps) {
  const { width, height, hubRadius, petals, emptyPetals, layerSlotCount } = flowerMetrics(groups, spec);
  const cx = width / 2;
  const cy = height / 2;
  if (!groups.length) return <><TitleBlock spec={spec} width={width} /><EmptyDiagram spec={spec} /></>;
  const items = groups.map((group, index) => {
    const petal = petals[index];
    const geometry = flowerPetalGeometry(petal, { x: cx, y: cy });
    const color = styledGroupColor(group, index, spec);
    const style = itemStyle(group, spec);
    return {
      group,
      index,
      petal,
      geometry,
      color,
      style,
      stroke: groupStrokeColor(group, index, spec),
      transform: style.rotation
        ? `rotate(${style.rotation} ${geometry.profile.root.x} ${geometry.profile.root.y})`
        : undefined,
    };
  });
  const emptyItems = emptyPetals.map((petal, index) => {
    const geometry = flowerPetalGeometry(petal, { x: cx, y: cy });
    const paletteIndex = petal.layerIndex * Math.max(1, layerSlotCount) + petal.slotIndex;
    const color = paletteColor(paletteIndex, spec.palette);
    return {
      key: `flower-empty-${petal.layerIndex}-${petal.slotIndex}-${index}`,
      petal,
      geometry,
      color,
      stroke: spec.borderColor ?? color,
      transform: undefined,
    };
  });
  const shapeItems = [
    ...items.map((item) => ({
      key: `flower-shape-${item.group.sourceNodeId}`,
      petal: item.petal,
      geometry: item.geometry,
      color: item.color,
      stroke: item.stroke,
      transform: item.transform,
    })),
    ...emptyItems,
  ];
  const layerIndexes = [...new Set(shapeItems.map((item) => item.petal.layerIndex))]
    .sort((first, second) => second - first);
  // Finish each back layer (shape and content) before painting the next
  // foreground layer, so tucked petals and their labels are occluded together.
  const orderedLayers = layerIndexes.map((layerIndex) => ({
    layerIndex,
    shapes: shapeItems.filter((item) => item.petal.layerIndex === layerIndex),
    content: items.filter((item) => item.petal.layerIndex === layerIndex),
  }));
  const renderContent = ({ group, petal, geometry, color, style, transform }: typeof items[number]) => {
    const center = geometry.profile.labelCenter;
    const sourceText = sourceDisplayLabel(group, spec)
      + (spec.showCounts ? " (" + group.count + ")" : "");
    const accessibleLabel = group.sourceLabel + ": "
      + group.targets.map((target) => target.label).join(", ");
    if (petal.flow.overflowed) {
      return (
        <g
          key={`flower-content-${group.sourceNodeId}`}
          role="img"
          aria-label={accessibleLabel}
          transform={transform}
        >
          <title>{accessibleLabel}</title>
        </g>
      );
    }
    return (
      <g
        key={`flower-content-${group.sourceNodeId}`}
        role="group"
        aria-label={group.sourceLabel}
        transform={transform}
      >
        <title>{group.sourceLabel + ": " + group.targets.map((target) => target.label).join(", ")}</title>
        <SvgTextLines
          value={sourceText}
          lines={petal.flow.source.lines}
          x={center.x + petal.flow.source.x}
          y={center.y + petal.flow.source.y}
          fontSize={petal.flow.source.fontSize}
          lineHeight={petal.flow.source.lineHeight}
          fillOverride={style.textColor}
          weight={800}
        />
        {petal.flow.targets.map((placement) => {
          const target = group.targets[placement.targetIndex];
          const bulletX = center.x + placement.bulletX;
          const labelY = center.y + placement.y;
          return (
            <g key={target.id}>
              <circle
                cx={bulletX}
                cy={labelY}
                r={Math.max(1.8, Math.min(3, placement.fontSize * 0.2))}
                fill={color}
              />
              <SvgTextLines
                value={target.label}
                lines={placement.lines}
                x={center.x + placement.labelX}
                y={labelY}
                fontSize={placement.fontSize}
                lineHeight={placement.lineHeight}
                fillOverride={style.textColor}
                weight={600}
                anchor="start"
              />
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <>
      {orderedLayers.map(({ layerIndex, shapes, content }) => (
        <g key={`flower-layer-${layerIndex}`}>
          {shapes.map(({ key, geometry, color, stroke, transform }) => (
            <g
              key={key}
              transform={transform}
              aria-hidden="true"
            >
              <path
                d={geometry.path}
                fill={tint(color, 0.7)}
                fillOpacity={groupFillOpacity(spec)}
                stroke={stroke}
                strokeWidth={groupStrokeWidth(spec)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}
          {content.map(renderContent)}
        </g>
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={hubRadius}
        fill={spec.centerFillColor ?? "#0f172a"}
        stroke={spec.centerBorderColor ?? "#ffffff"}
        strokeWidth={spec.centerBorderWidth ?? 4}
      />
      <SvgLabel
        value={spec.title || "Relationships"}
        x={cx}
        y={cy}
        width={hubRadius * 1.55}
        height={hubRadius * 1.45}
        fontSize={Math.max(16, spec.textSize * 1.15)}
        fillOverride={spec.centerTextColor ?? "#ffffff"}
        weight={800}
        maximumLines={3}
      />
    </>
  );
}

function CardGridLayout({ groups, spec }: RelationshipDiagramSvgProps) {
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, groups.length) * 1.35))));
  const cardWidth = spec.density === "compact" ? 240 : 278;
  const targetLineHeight = Math.max(23, spec.textSize * 1.45);
  const maximumTargetCount = Math.max(1, ...groups.map((group) => group.targets.length));
  const cardHeight = Math.max(
    spec.density === "spacious" ? 260 : spec.density === "compact" ? 188 : 224,
    96 + maximumTargetCount * targetLineHeight
  );
  const gap = spec.density === "compact" ? 14 : 20;
  const width = groups.length
    ? columns * cardWidth + (columns + 1) * gap
    : 760;
  if (!groups.length) return <><TitleBlock spec={spec} width={Math.max(760, width)} /><EmptyDiagram spec={spec} /></>;
  return (
    <>
      <TitleBlock spec={spec} width={width} />
      {groups.map((group, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = gap + column * (cardWidth + gap);
        const y = 82 + gap + row * (cardHeight + gap);
        const color = styledGroupColor(group, index, spec);
        const style = itemStyle(group, spec);
        const stroke = groupStrokeColor(group, index, spec);
        return (
          <g
            key={group.sourceNodeId}
            transform={style.rotation ? `rotate(${style.rotation} ${x + cardWidth / 2} ${y + cardHeight / 2})` : undefined}
          >
            <rect x={x} y={y} width={cardWidth} height={cardHeight} rx="18" fill={tint(color, 0.84)} fillOpacity={groupFillOpacity(spec)} stroke={stroke} strokeWidth={groupStrokeWidth(spec)} />
            <rect x={x} y={y} width={cardWidth} height="52" rx="18" fill={color} fillOpacity={groupFillOpacity(spec)} />
            <rect x={x} y={y + 35} width={cardWidth} height="17" fill={color} fillOpacity={groupFillOpacity(spec)} />
            <SvgLabel
              value={sourceDisplayLabel(group, spec)}
              x={x + 18}
              y={y + 26}
              width={cardWidth - 72}
              height={40}
              fontSize={Math.max(12, style.fontSize ?? spec.textSize)}
              fill="#ffffff"
              fillOverride={style.textColor}
              weight={750}
              anchor="start"
              maximumLines={1}
            />
            {spec.showCounts && (
              <g>
                <circle cx={x + cardWidth - 27} cy={y + 26} r="16" fill="rgba(255,255,255,0.92)" />
                <SvgLabel value={String(group.count)} x={x + cardWidth - 27} y={y + 26} width={26} height={24} fontSize={11} weight={800} maximumLines={1} />
              </g>
            )}
            {group.targets.map((target, targetIndex) => (
              <g key={target.id}>
                <circle cx={x + 20} cy={y + 75 + targetIndex * targetLineHeight} r="3.5" fill={color} />
                <SvgLabel
                  value={target.label}
                  x={x + 32}
                  y={y + 75 + targetIndex * targetLineHeight}
                  width={cardWidth - 48}
                  height={targetLineHeight - 4}
                  fontSize={Math.max(10, (style.fontSize ?? spec.textSize) * 0.82)}
                  fillOverride={style.textColor}
                  weight={550}
                  anchor="start"
                  maximumLines={1}
                />
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
}

function MatrixLayout({ groups, spec }: RelationshipDiagramSvgProps) {
  const targets = Array.from(new Map(
    groups.flatMap((group) => group.targets).map((target) => [target.id, target])
  ).values());
  const rowHeight = spec.density === "compact" ? 42 : spec.density === "spacious" ? 64 : 52;
  const columnWidth = spec.density === "compact" ? 54 : 68;
  const labelWidth = 230;
  const width = Math.max(760, labelWidth + 80 + targets.length * columnWidth);
  const headerHeight = 230;
  const height = Math.max(520, headerHeight + groups.length * rowHeight + 40);
  if (!groups.length) return <><TitleBlock spec={spec} width={width} /><EmptyDiagram spec={spec} /></>;
  return (
    <>
      <TitleBlock spec={spec} width={width} />
      <rect x="22" y="82" width={width - 44} height={height - 106} rx="18" fill="#ffffff" stroke="#cbd5e1" />
      {targets.map((target, index) => {
        const x = labelWidth + 66 + index * columnWidth;
        const total = groups.reduce(
          (count, group) => count + (group.targets.some((candidate) => candidate.id === target.id) ? 1 : 0),
          0
        );
        return (
          <SvgLabel
            key={target.id}
            value={target.label + (spec.showCounts ? " (" + total + ")" : "")}
            x={x}
            y={headerHeight - 20}
            width={140}
            height={columnWidth - 10}
            fontSize={Math.max(9, spec.textSize * 0.72)}
            weight={600}
            anchor="start"
            maximumLines={1}
            transform={"rotate(-58 " + x + " " + (headerHeight - 20) + ")"}
          />
        );
      })}
      {groups.map((group, rowIndex) => {
        const y = headerHeight + rowIndex * rowHeight;
        const color = styledGroupColor(group, rowIndex, spec);
        const style = itemStyle(group, spec);
        const stroke = groupStrokeColor(group, rowIndex, spec);
        const related = new Set(group.targets.map((target) => target.id));
        return (
          <g
            key={group.sourceNodeId}
            transform={style.rotation ? `rotate(${style.rotation} ${width / 2} ${y})` : undefined}
          >
            <rect
              x="24"
              y={y - rowHeight / 2}
              width={width - 48}
              height={rowHeight}
              fill={style.fillColor ? tint(color, 0.88) : rowIndex % 2 ? "#f8fafc" : "#ffffff"}
              fillOpacity={groupFillOpacity(spec)}
              stroke={style.borderColor || spec.borderColor ? stroke : "none"}
              strokeWidth={groupStrokeWidth(spec)}
            />
            <rect x="24" y={y - rowHeight / 2} width="7" height={rowHeight} fill={color} />
            <SvgLabel
              value={sourceDisplayLabel(group, spec) + (spec.showCounts ? " (" + group.count + ")" : "")}
              x={42}
              y={y}
              width={labelWidth - 42}
              height={rowHeight - 8}
              fontSize={Math.max(10, (style.fontSize ?? spec.textSize) * 0.86)}
              fillOverride={style.textColor}
              weight={650}
              anchor="start"
              maximumLines={2}
            />
            {targets.map((target, targetIndex) => related.has(target.id) ? (
              <circle
                key={target.id}
                cx={labelWidth + 66 + targetIndex * columnWidth}
                cy={y}
                r={spec.density === "compact" ? 7 : 9}
                fill={color}
                stroke="#ffffff"
                strokeWidth="2"
              />
            ) : null)}
          </g>
        );
      })}
    </>
  );
}

function radialHubMetrics(groups: RelationshipGroup[], spec: RelationshipDiagramSpec) {
  const count = Math.max(1, groups.length);
  const maximumTargets = Math.max(1, ...groups.map((group) => group.targets.length));
  const panelWidth = spec.density === "compact" ? 260 : 294;
  const panelHeight = Math.max(176, 92 + maximumTargets * Math.max(21, spec.textSize * 1.42));
  const halfExtent = Math.hypot(panelWidth / 2, panelHeight / 2);
  const separation = count > 1 ? Math.sin(Math.PI / count) : 1;
  const radius = Math.max(260, (halfExtent + 28) / Math.max(0.12, separation));
  const size = Math.max(860, Math.ceil((radius + halfExtent + 56) * 2));
  return { count, radius, width: size, height: size, panelWidth, panelHeight };
}

function RadialHubLayout({ groups, spec }: RelationshipDiagramSvgProps) {
  const { count, radius, width, height, panelWidth, panelHeight } = radialHubMetrics(groups, spec);
  const cx = width / 2;
  const cy = height / 2 + 16;
  if (!groups.length) return <><TitleBlock spec={spec} width={width} /><EmptyDiagram spec={spec} /></>;
  return (
    <>
      <TitleBlock spec={spec} width={width} showTitle={false} />
      {groups.map((group, index) => {
        const angle = -90 + index * 360 / count;
        const point = polar(cx, cy, radius, angle);
        const color = styledGroupColor(group, index, spec);
        const style = itemStyle(group, spec);
        const stroke = groupStrokeColor(group, index, spec);
        return (
          <g
            key={group.sourceNodeId}
            transform={style.rotation ? `rotate(${style.rotation} ${point.x} ${point.y})` : undefined}
          >
            <path
              d={"M " + cx + " " + cy + " Q " + ((cx + point.x) / 2) + " " + ((cy + point.y) / 2) + " " + point.x + " " + point.y}
              fill="none"
              stroke={style.borderColor || spec.borderColor ? stroke : tint(color, 0.32)}
              strokeWidth={Math.max(2, groupStrokeWidth(spec))}
            />
            <rect
              x={point.x - panelWidth / 2}
              y={point.y - panelHeight / 2}
              width={panelWidth}
              height={panelHeight}
              rx="26"
              fill={tint(color, 0.78)}
              fillOpacity={groupFillOpacity(spec)}
              stroke={stroke}
              strokeWidth={groupStrokeWidth(spec)}
            />
            <SvgLabel
              value={sourceDisplayLabel(group, spec) + (spec.showCounts ? " (" + group.count + ")" : "")}
              x={point.x}
              y={point.y - panelHeight / 2 + 32}
              width={panelWidth - 38}
              height={50}
              fontSize={Math.max(12, style.fontSize ?? spec.textSize)}
              fillOverride={style.textColor}
              weight={780}
              maximumLines={2}
            />
            {group.targets.map((target, targetIndex) => (
              <SvgLabel
                key={target.id}
                value={(spec.showIcons ? "- " : "") + target.label}
                x={point.x}
                y={point.y - panelHeight / 2 + 72 + targetIndex * Math.max(21, spec.textSize * 1.42)}
                width={panelWidth - 38}
                height={Math.max(17, spec.textSize * 1.42 - 4)}
                fontSize={Math.max(10, (style.fontSize ?? spec.textSize) * 0.78)}
                fillOverride={style.textColor}
                weight={550}
                maximumLines={1}
              />
            ))}
          </g>
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r="122"
        fill={spec.centerFillColor ?? "#0f172a"}
        stroke={spec.centerBorderColor ?? "#ffffff"}
        strokeWidth={spec.centerBorderWidth ?? 4}
      />
      <SvgLabel
        value={spec.title || "Relationships"}
        x={cx}
        y={cy}
        width={190}
        height={180}
        fontSize={Math.max(16, spec.textSize * 1.15)}
        fillOverride={spec.centerTextColor ?? "#ffffff"}
        weight={800}
        maximumLines={3}
      />
    </>
  );
}

export function relationshipDiagramDimensions(
  groups: RelationshipGroup[],
  spec: RelationshipDiagramSpec
): { width: number; height: number } {
  if (spec.layout === "arc-fan") {
    const { width, height } = arcFanMetrics(groups, spec);
    return { width, height };
  }
  if (spec.layout === "flower") {
    const { width, height } = flowerMetrics(groups, spec);
    return { width, height };
  }
  if (spec.layout === "radial-hub") {
    const { width, height } = radialHubMetrics(groups, spec);
    return { width, height };
  }
  if (spec.layout === "card-grid") {
    const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, groups.length) * 1.35))));
    const cardWidth = spec.density === "compact" ? 240 : 278;
    const maximumTargetCount = Math.max(1, ...groups.map((group) => group.targets.length));
    const cardHeight = Math.max(
      spec.density === "spacious" ? 260 : spec.density === "compact" ? 188 : 224,
      96 + maximumTargetCount * Math.max(23, spec.textSize * 1.45)
    );
    const gap = spec.density === "compact" ? 14 : 20;
    const rows = Math.max(1, Math.ceil(groups.length / columns));
    return {
      width: groups.length ? columns * cardWidth + (columns + 1) * gap : 760,
      height: groups.length ? 94 + rows * cardHeight + (rows + 1) * gap : 560,
    };
  }
  const targetCount = new Set(groups.flatMap((group) => group.targets.map((target) => target.id))).size;
  const rowHeight = spec.density === "compact" ? 42 : spec.density === "spacious" ? 64 : 52;
  const columnWidth = spec.density === "compact" ? 54 : 68;
  return {
    width: Math.max(760, 310 + targetCount * columnWidth),
    height: Math.max(520, 230 + groups.length * rowHeight + 40),
  };
}

export function RelationshipDiagramSvg({
  groups,
  spec,
  exportId,
  measureText = false,
}: RelationshipDiagramSvgProps) {
  const { width, height } = relationshipDiagramDimensions(groups, spec);
  const background = isTransparentRelationshipDiagramBackground(spec.background)
    ? "transparent"
    : spec.background;
  let content: ReactNode;
  if (spec.layout === "flower") content = <FlowerLayout groups={groups} spec={spec} />;
  else if (spec.layout === "matrix") content = <MatrixLayout groups={groups} spec={spec} />;
  else if (spec.layout === "card-grid") content = <CardGridLayout groups={groups} spec={spec} />;
  else if (spec.layout === "radial-hub") content = <RadialHubLayout groups={groups} spec={spec} />;
  else content = <ArcFanLayout groups={groups} spec={spec} />;

  return (
    <DiagramVisualStyleContext.Provider value={{
      fontFamily: spec.fontFamily,
      fontWeight: spec.fontWeight,
      fontStyle: spec.fontStyle,
      textColor: spec.textColor,
      maximizeLabelText: spec.maximizeLabelText,
    }}>
    <TextMeasurementContext.Provider value={measureText}>
    <svg
      viewBox={"0 0 " + width + " " + height}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={spec.title || "Relationship diagram"}
      data-relationship-diagram-export={exportId}
      style={{ background }}
    >
      <rect width={width} height={height} fill={background} data-export-bounds />
      {spec.decorativeLevel === "ornate" && (
        <g opacity="0.12" pointerEvents="none">
          {Array.from({ length: 24 }, (_, index) => (
            <circle
              key={index}
              cx={(index * 173) % width}
              cy={(index * 97) % height}
              r={3 + index % 4}
              fill="#6366f1"
            />
          ))}
        </g>
      )}
      {content}
    </svg>
    </TextMeasurementContext.Provider>
    </DiagramVisualStyleContext.Provider>
  );
}
