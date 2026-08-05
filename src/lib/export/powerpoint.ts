import PptxGenJS from "pptxgenjs";
import type { Edge, Node } from "@xyflow/react";
import type {
  FrameNodeData,
  NodeRelationship,
  RadialChartData,
  RelationshipDiagramSpec,
  ShapeType,
  VidyaEdgeData,
} from "../types";
import {
  applyPresentationStopGeometry,
  type PresentationStop,
} from "../canvas/presentation";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";
import {
  buildRelationshipGroupsForSpec,
  normalizeRelationshipDiagramSpec,
} from "../relationship-diagram";
import {
  POWERPOINT_SLIDE,
  buildPowerPointTransform,
  editableNodeText,
  fittedPowerPointFontSize,
  overviewNodeText,
  plainPowerPointText,
  powerPointColor,
  powerPointShapeName,
  powerPointTextRuns,
  safePowerPointFilename,
  scaledFontSize,
  transformNodeRect,
  type PowerPointRect,
  type PowerPointTransform,
} from "./powerpoint-layout";

const DEFAULT_FONT = "Aptos";
const DEVANAGARI_FONT = "Nirmala UI";
const ACCENT = "4F46E5";
const INK = "172033";
const MUTED_INK = "64748B";
const SLIDE_BACKGROUND = "F8FAFC";

export interface EditablePowerPointOptions {
  boardTitle: string;
  nodes: readonly Node[];
  edges: readonly Edge[];
  relationships: readonly NodeRelationship[];
  stops: readonly PresentationStop[];
  filename?: string;
  onProgress?: (completedSlides: number, totalSlides: number) => void;
}

export interface EditablePowerPointResult {
  slideCount: number;
  editableObjectCount: number;
  warnings: string[];
}

interface RenderContext {
  pptx: PptxGenJS;
  slide: PptxGenJS.Slide;
  allNodes: readonly Node[];
  allEdges: readonly Edge[];
  relationships: readonly NodeRelationship[];
  transform: PowerPointTransform;
  nodeById: ReadonlyMap<string, Node>;
  warnings: string[];
  objectCount: number;
  summarizeNodeText: boolean;
}

interface PowerPointMatrixOverviewPage {
  rootId: string;
  foldStopIds: string[];
  includeOtherTopics: boolean;
  pageNumber: number;
  pageCount: number;
}

type PowerPointPresentationStop = PresentationStop & {
  powerPointMatrixOverview?: PowerPointMatrixOverviewPage;
};

const MATRIX_OVERVIEW_FOLDS_PER_PAGE = 6;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function combineTransparency(colorTransparency: number, opacity: unknown, fallbackOpacity: number): number {
  const normalizedOpacity = typeof opacity === "number" && Number.isFinite(opacity)
    ? clamp(opacity, 0, 1)
    : fallbackOpacity;
  const colorOpacity = 1 - colorTransparency / 100;
  return Math.round((1 - colorOpacity * normalizedOpacity) * 100);
}

function nativeShape(
  pptx: PptxGenJS,
  shapeName: string
): PptxGenJS.ShapeType {
  const shape = pptx.ShapeType[shapeName as keyof typeof pptx.ShapeType];
  return shape ?? pptx.ShapeType.rect;
}

function nodeFontFace(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.fontFamily === "string" && data.fontFamily.trim()) return data.fontFamily;
  return /[\u0900-\u097f]/u.test(editableNodeText(node)) ? DEVANAGARI_FONT : DEFAULT_FONT;
}

function nodeFill(node: Node): { color: string; transparency: number } {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const authored = data.fillColor ?? data.radialFillColor ?? data.background ?? data.color;
  const color = powerPointColor(authored, node.type === "sticky" ? "FEF3C7" : "EEF2FF");
  const fallbackOpacity = node.type === "sticky" ? 0.95 : data.fillColor ? 0.92 : 0.16;
  return {
    color: color.color,
    transparency: combineTransparency(color.transparency, data.fillOpacity, fallbackOpacity),
  };
}

function nodeLine(node: Node): PptxGenJS.ShapeLineProps {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const color = powerPointColor(
    data.borderColor ?? data.radialBorderColor ?? data.color,
    ACCENT
  );
  const borderStyle = data.borderStyle ?? data.radialBorderStyle;
  return {
    color: color.color,
    transparency: color.transparency,
    width: clamp(finiteNumber(data.borderWidth ?? data.radialBorderWidth, 1.5), 0.5, 8),
    dashType: borderStyle === "dotted" ? "sysDot" : borderStyle === "dashed" ? "dash" : "solid",
  };
}

function nodeTextOptions(
  node: Node,
  transform: PowerPointTransform,
  rect: PowerPointRect,
  text: string,
  summary: boolean
): Pick<
  PptxGenJS.TextPropsOptions,
  "fontFace" | "fontSize" | "color" | "bold" | "italic" | "align" | "valign" | "rotate"
> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const color = powerPointColor(data.textColor ?? data.radialTextColor, INK);
  const align = data.textAlign === "left" || data.textAlign === "right" || data.textAlign === "justify"
    ? data.textAlign
    : summary ? "center" : text.length > 150 ? "left" : "center";
  const valign = data.textVerticalAlign === "top" || data.textVerticalAlign === "bottom"
    ? data.textVerticalAlign
    : summary ? "middle" : text.length > 150 ? "top" : "middle";
  const preferredFontSize = summary
    ? 18
    : Math.max(18, scaledFontSize(data.fontSize, transform.scale));
  return {
    fontFace: nodeFontFace(node),
    fontSize: fittedPowerPointFontSize(
      text,
      rect,
      preferredFontSize,
      16,
      summary ? 18 : 28
    ),
    color: color.color,
    bold: summary || data.fontWeight === "bold",
    italic: data.fontStyle === "italic",
    align,
    valign,
    rotate: finiteNumber(data.textRotation, 0),
  };
}

function editableNodeRuns(
  node: Node,
  text: string,
  summary: boolean,
  fontSize: number
): PptxGenJS.TextProps[] {
  if (summary) {
    return [{ text, options: { bold: true, fontSize } }];
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  const authoredRichSource = [data.richText, data.text, data.label, data.title]
    .find((value): value is string =>
      typeof value === "string"
      && (/<[a-z][\s\S]*>/i.test(value) || /https?:\/\//i.test(value))
    );
  const source = authoredRichSource ?? text;
  let runs = powerPointTextRuns(source);
  if (!authoredRichSource && runs.length === 1 && runs[0].text.includes("\n")) {
    const [heading, ...body] = runs[0].text.split("\n");
    runs = body.length
      ? [{ text: heading }, { text: "\n" }, { text: body.join("\n") }]
      : runs;
  }
  let firstContentRun = true;
  return (runs.length ? runs : [{ text }]).map((run) => {
    const hasContent = run.text.trim().length > 0;
    const makeHeading = firstContentRun && hasContent;
    if (hasContent) firstContentRun = false;
    return {
      text: run.text,
      options: {
        bold: run.bold ?? makeHeading,
        italic: run.italic,
        underline: run.underline ? { style: "sng" } : undefined,
        color: run.color,
        hyperlink: run.hyperlink ? { url: run.hyperlink } : undefined,
        fontSize: makeHeading ? Math.min(28, fontSize + 2) : fontSize,
      },
    };
  });
}

function addEditableLine(
  context: RenderContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  line: PptxGenJS.ShapeLineProps,
  objectName: string
): void {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.max(0.001, Math.abs(x2 - x1));
  const height = Math.max(0.001, Math.abs(y2 - y1));
  const negativeSlope = (x2 - x1) * (y2 - y1) < 0;
  const nativeDirectionMatchesRequested = Math.abs(x2 - x1) > 0.001
    ? x1 <= x2
    : y1 <= y2;
  const directedLine = nativeDirectionMatchesRequested
    ? line
    : {
        ...line,
        beginArrowType: line.endArrowType,
        endArrowType: line.beginArrowType,
      };
  context.slide.addShape(context.pptx.ShapeType.line, {
    x,
    y,
    w: width,
    h: height,
    flipV: negativeSlope,
    line: directedLine,
    objectName,
  });
  context.objectCount += 1;
}

function renderFrame(context: RenderContext, node: Node, rect: PowerPointRect): void {
  const data = (node.data ?? {}) as unknown as FrameNodeData;
  const isGeneratedMatrixFrame = typeof (node.data as Record<string, unknown>)?.matrixFrameFor === "string";
  const line = nodeLine(node);
  context.slide.addShape(context.pptx.ShapeType.roundRect, {
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
    fill: { color: nodeFill(node).color, transparency: 94 },
    line,
    rectRadius: 0.035,
    objectName: `Editable frame: ${editableNodeText(node)}`,
  });
  context.objectCount += 1;

  for (const [index, grid] of (data.matrixGridLines ?? []).entries()) {
    addEditableLine(
      context,
      rect.x + grid.x1 * context.transform.scale,
      rect.y + grid.y1 * context.transform.scale,
      rect.x + grid.x2 * context.transform.scale,
      rect.y + grid.y2 * context.transform.scale,
      {
        ...line,
        color: powerPointColor(grid.color, String(line.color ?? ACCENT)).color,
        width: Math.max(0.5, (line.width ?? 1) * 0.8),
      },
      `Editable matrix grid ${index + 1}`
    );
  }

  for (const cell of data.matrixRepeatedCells ?? []) {
    const cellFill = powerPointColor(cell.background, "FFFFFF");
    const cellBorder = powerPointColor(cell.borderColor, String(line.color ?? ACCENT));
    context.slide.addText(plainPowerPointText(cell.html) || cell.text, {
      shape: context.pptx.ShapeType.rect,
      x: rect.x + cell.x * context.transform.scale,
      y: rect.y + cell.y * context.transform.scale,
      w: Math.max(0.12, cell.width * context.transform.scale),
      h: Math.max(0.08, cell.height * context.transform.scale),
      fill: { color: cellFill.color, transparency: cellFill.transparency },
      line: {
        color: cellBorder.color,
        transparency: cellBorder.transparency,
        width: finiteNumber(cell.borderWidth, 1),
        dashType: cell.borderStyle === "dotted" ? "sysDot" : cell.borderStyle === "dashed" ? "dash" : "solid",
      },
      color: powerPointColor(cell.color, INK).color,
      fontFace: cell.fontFamily || DEFAULT_FONT,
      fontSize: clamp(Number.parseFloat(cell.fontSize ?? "14") * context.transform.scale * 72, 9, 24),
      bold: String(cell.fontWeight) === "bold" || Number(cell.fontWeight) >= 600,
      italic: cell.fontStyle === "italic",
      align: cell.textAlign ?? "center",
      valign: "middle",
      margin: 3,
      fit: "shrink",
      objectName: `Editable repeated matrix cell: ${cell.text}`,
    });
    context.objectCount += 1;
  }

  if (!isGeneratedMatrixFrame) {
    context.slide.addText(editableNodeText(node), {
      x: rect.x + 0.08,
      y: rect.y + 0.02,
      w: Math.max(0.25, rect.width - 0.16),
      h: Math.min(0.32, Math.max(0.12, rect.height * 0.16)),
      fontFace: nodeFontFace(node),
      fontSize: clamp(scaledFontSize((node.data as Record<string, unknown>)?.fontSize, context.transform.scale), 9, 17),
      color: powerPointColor((node.data as Record<string, unknown>)?.textColor, String(line.color ?? ACCENT)).color,
      bold: true,
      margin: 0,
      fit: "shrink",
      valign: "middle",
      objectName: `Editable frame title: ${editableNodeText(node)}`,
    });
    context.objectCount += 1;
  }
}

function renderGenericNode(context: RenderContext, node: Node, rect: PowerPointRect): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const shapeType = typeof data.shapeType === "string" ? data.shapeType as ShapeType : undefined;
  const isTextOnly = node.type === "text" && !data.textFrameStyle;
  const fill = nodeFill(node);
  const line = nodeLine(node);
  const completeText = editableNodeText(node);
  const text = context.summarizeNodeText ? overviewNodeText(node) : completeText;
  const textOptions = nodeTextOptions(node, context.transform, rect, text, context.summarizeNodeText);
  const runs = editableNodeRuns(
    node,
    text,
    context.summarizeNodeText,
    textOptions.fontSize ?? 18
  );
  context.slide.addText(runs, {
    shape: isTextOnly
      ? context.pptx.ShapeType.rect
      : nativeShape(context.pptx, powerPointShapeName(shapeType)),
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
    fill: isTextOnly ? { color: "FFFFFF", transparency: 100 } : fill,
    line: isTextOnly ? { color: "FFFFFF", transparency: 100, width: 0.5 } : line,
    margin: context.summarizeNodeText ? 5 : clamp(finiteNumber(data.textPadding, 6), 4, 18),
    fit: "shrink",
    wrap: true,
    rotate: finiteNumber(data.objectRotation ?? data.rotation, 0),
    shadow: data.surfaceEffect && data.surfaceEffect !== "flat"
      ? { type: "outer", color: "64748B", opacity: 0.18, blur: 1.5, angle: 45, offset: 1 }
      : undefined,
    ...textOptions,
    objectName: `Editable ${node.type || "node"}: ${text.slice(0, 60)}`,
  });
  context.objectCount += 1;
}

function renderBoardEdge(
  context: RenderContext,
  edge: Edge,
  rectByNodeId: ReadonlyMap<string, PowerPointRect>
): void {
  const source = rectByNodeId.get(edge.source);
  const target = rectByNodeId.get(edge.target);
  if (!source || !target) return;
  const data = (edge.data ?? {}) as VidyaEdgeData;
  const color = powerPointColor(data.color ?? data.layoutColor, "64748B");
  const pathStyle = data.pathStyle ?? (data.dashed ? "dashed" : "solid");
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const anchoredPoint = (
    rect: PowerPointRect,
    anchor: VidyaEdgeData["sourceAnchor"] | VidyaEdgeData["targetAnchor"]
  ): { x: number; y: number } | undefined => {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return undefined;
    return {
      x: rect.x + clamp(anchor.x, 0, 100) / 100 * rect.width,
      y: rect.y + clamp(anchor.y, 0, 100) / 100 * rect.height,
    };
  };
  let sourcePoint = horizontal
    ? { x: source.x + (dx >= 0 ? source.width : 0), y: source.y + source.height / 2 }
    : { x: source.x + source.width / 2, y: source.y + (dy >= 0 ? source.height : 0) };
  let targetPoint = horizontal
    ? { x: target.x + (dx >= 0 ? 0 : target.width), y: target.y + target.height / 2 }
    : { x: target.x + target.width / 2, y: target.y + (dy >= 0 ? 0 : target.height) };
  sourcePoint = anchoredPoint(source, data.sourceAnchor) ?? sourcePoint;
  targetPoint = anchoredPoint(target, data.targetAnchor) ?? targetPoint;
  const authoredWaypoints = (data.waypoints ?? [])
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      x: point.x * context.transform.scale + context.transform.offsetX,
      y: point.y * context.transform.scale + context.transform.offsetY,
    }));
  const hasAuthoredRoute = !!data.sourceAnchor || !!data.targetAnchor || authoredWaypoints.length > 0;
  const route: Array<{ x: number; y: number }> = [sourcePoint, ...authoredWaypoints, targetPoint];

  // Dense teaching overviews often place one root above columns of children.
  // Route through the column gutters so links remain visible without crossing labels.
  if (
    context.summarizeNodeText
    && !hasAuthoredRoute
    && Math.abs(dy) > Math.max(source.height, target.height) / 2
  ) {
    if (targetCenter.x < source.x) {
      sourcePoint = { x: source.x, y: sourceCenter.y };
      targetPoint = { x: target.x + target.width, y: targetCenter.y };
      const gutterX = (source.x + targetPoint.x) / 2;
      route.splice(0, route.length, sourcePoint, { x: gutterX, y: sourcePoint.y }, { x: gutterX, y: targetPoint.y }, targetPoint);
    } else if (targetCenter.x > source.x + source.width) {
      sourcePoint = { x: source.x + source.width, y: sourceCenter.y };
      targetPoint = { x: target.x, y: targetCenter.y };
      const gutterX = (sourcePoint.x + target.x) / 2;
      route.splice(0, route.length, sourcePoint, { x: gutterX, y: sourcePoint.y }, { x: gutterX, y: targetPoint.y }, targetPoint);
    } else {
      sourcePoint = { x: sourceCenter.x, y: source.y + (dy >= 0 ? source.height : 0) };
      targetPoint = { x: targetCenter.x, y: target.y + (dy >= 0 ? 0 : target.height) };
      route.splice(0, route.length, sourcePoint, targetPoint);
    }
  }

  const baseLine: PptxGenJS.ShapeLineProps = {
    color: color.color,
    transparency: context.summarizeNodeText ? Math.max(color.transparency, 35) : color.transparency,
    width: context.summarizeNodeText
      ? clamp(finiteNumber(data.width, 1.15), 0.7, 1.5)
      : clamp(finiteNumber(data.width, 1.5), 0.5, 8),
    dashType: pathStyle === "dotted" ? "sysDot" : pathStyle === "dashed" ? "dash" : "solid",
  };
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    addEditableLine(context, start.x, start.y, end.x, end.y, {
      ...baseLine,
      beginArrowType: index === 0 && data.arrowStart ? "triangle" : "none",
      endArrowType: index === route.length - 2 && data.arrowEnd ? "triangle" : "none",
    }, `Editable connector: ${edge.id}${route.length > 2 ? ` segment ${index + 1}` : ""}`);
  }

  const label = plainPowerPointText(data.label);
  if (!label) return;
  const labelSegmentIndex = route.length > 2 ? 1 : 0;
  const labelStart = route[labelSegmentIndex];
  const labelEnd = route[labelSegmentIndex + 1];
  const x = (labelStart.x + labelEnd.x) / 2;
  const y = (labelStart.y + labelEnd.y) / 2;
  context.slide.addText(label, {
    x: x + (Math.abs(labelEnd.x - labelStart.x) < 0.05 ? 0.08 : -1),
    y: y - 0.17,
    w: 2,
    h: 0.34,
    color: powerPointColor(data.labelColor, color.color).color,
    fontFace: data.labelFontFamily || DEFAULT_FONT,
    fontSize: clamp(finiteNumber(data.labelFontSize, 16), 16, 20),
    bold: data.labelFontWeight === "bold",
    italic: data.labelFontStyle === "italic",
    align: "center",
    valign: "middle",
    margin: 1,
    fit: "shrink",
    fill: { color: SLIDE_BACKGROUND, transparency: 10 },
    line: { color: "FFFFFF", transparency: 100 },
    objectName: `Editable connector label: ${label}`,
  });
  context.objectCount += 1;
}

interface RadialPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node?: Node;
  label: string;
  depth: number;
}

function presentationStopUsesSummaries(
  stop: PresentationStop,
  nodeById: ReadonlyMap<string, Node>
): boolean {
  if (stop.kind === "overview") return true;
  const contentNodes = stop.nodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is Node => !!node && !node.hidden && node.type !== "frame");
  if (contentNodes.length > 6) return true;
  if (contentNodes.length <= 3) return false;
  const averageTextLength = contentNodes.reduce(
    (total, node) => total + editableNodeText(node).length,
    0
  ) / contentNodes.length;
  return averageTextLength > 140;
}

function canCreateAutomaticDetail(node: Node | undefined): node is Node {
  if (!node || node.hidden || node.type === "frame" || node.type === "sunburst" || node.type === "relationshipDiagram") {
    return false;
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  return !(node.type === "shape" && (data.radialChart as RadialChartData | undefined)?.enabled);
}

function expandMatrixOverviewStops(
  stops: readonly PresentationStop[],
  nodes: readonly Node[]
): PowerPointPresentationStop[] {
  const overviewIndex = stops.findIndex((stop) => stop.kind === "overview");
  if (overviewIndex < 0) return [...stops];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const foldsByRoot = new Map<string, PresentationStop[]>();
  for (const stop of stops) {
    const rootId = stop.kind === "matrix-fold" ? stop.matrixFold?.rootId : undefined;
    if (!rootId || nodeById.get(rootId)?.hidden) continue;
    const folds = foldsByRoot.get(rootId) ?? [];
    folds.push(stop);
    foldsByRoot.set(rootId, folds);
  }
  if (!foldsByRoot.size) return [...stops];

  const overview = stops[overviewIndex];
  const pages: PowerPointPresentationStop[] = [];
  for (const [rootId, folds] of foldsByRoot) {
    for (let start = 0; start < folds.length; start += MATRIX_OVERVIEW_FOLDS_PER_PAGE) {
      pages.push({
        ...overview,
        id: `${overview.id}:matrix:${rootId}:${start / MATRIX_OVERVIEW_FOLDS_PER_PAGE}`,
        nodeIds: [...overview.nodeIds],
        powerPointMatrixOverview: {
          rootId,
          foldStopIds: folds
            .slice(start, start + MATRIX_OVERVIEW_FOLDS_PER_PAGE)
            .map((stop) => stop.id),
          includeOtherTopics: pages.length === 0,
          pageNumber: 0,
          pageCount: 0,
        },
      });
    }
  }
  const pageCount = pages.length;
  pages.forEach((page, index) => {
    const metadata = page.powerPointMatrixOverview!;
    metadata.pageNumber = index + 1;
    metadata.pageCount = pageCount;
    if (pageCount > 1) page.title = `${overview.title} · ${index + 1}/${pageCount}`;
  });

  return [
    ...stops.slice(0, overviewIndex),
    ...pages,
    ...stops.slice(overviewIndex + 1),
  ];
}

/**
 * Map slides stay concise, but the complete authored content must still appear
 * somewhere in the deck. Add one editable detail slide only for nodes that no
 * existing low-density teaching stop already covers.
 */
export function expandEditablePowerPointStops(
  stops: readonly PresentationStop[],
  nodes: readonly Node[]
): PresentationStop[] {
  const presentationStops = expandMatrixOverviewStops(stops, nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const fullCoverage = new Set<string>();
  for (const stop of presentationStops) {
    if (presentationStopUsesSummaries(stop, nodeById)) continue;
    stop.nodeIds.forEach((nodeId) => fullCoverage.add(nodeId));
  }

  const automaticDetails: PresentationStop[] = [];
  const scheduled = new Set<string>();
  for (const stop of presentationStops) {
    if (!presentationStopUsesSummaries(stop, nodeById)) continue;
    for (const nodeId of stop.nodeIds) {
      if (fullCoverage.has(nodeId) || scheduled.has(nodeId)) continue;
      const node = nodeById.get(nodeId);
      if (!canCreateAutomaticDetail(node)) continue;
      const completeText = editableNodeText(node);
      if (completeText === overviewNodeText(node)) continue;
      scheduled.add(nodeId);
      automaticDetails.push({
        id: `pptx-detail:${nodeId}`,
        kind: "branch",
        title: overviewNodeText(node),
        nodeIds: [nodeId],
      });
    }
  }
  return [...presentationStops, ...automaticDetails];
}

function renderRingGuide(context: RenderContext, rect: PowerPointRect, radiusRatio: number, name: string): void {
  const width = rect.width * radiusRatio;
  const height = rect.height * radiusRatio;
  context.slide.addShape(context.pptx.ShapeType.ellipse, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    w: width,
    h: height,
    fill: { color: "FFFFFF", transparency: 100 },
    line: { color: "CBD5E1", transparency: 30, width: 0.7, dashType: "sysDot" },
    objectName: name,
  });
  context.objectCount += 1;
}

function renderEditableRadialPositions(
  context: RenderContext,
  rect: PowerPointRect,
  positions: readonly RadialPosition[],
  parentById: ReadonlyMap<string, string | null>,
  centerId: string,
  centerFill = ACCENT,
  centerTextColor = "FFFFFF"
): void {
  const byId = new Map(positions.map((position) => [position.id, position]));
  const maxDepth = Math.max(0, ...positions.map((position) => position.depth));
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    renderRingGuide(context, rect, depth / Math.max(1, maxDepth), `Editable radial ring ${depth}`);
  }
  for (const position of positions) {
    const parentId = parentById.get(position.id);
    const parent = parentId ? byId.get(parentId) : null;
    if (!parent) continue;
    addEditableLine(
      context,
      parent.x + parent.width / 2,
      parent.y + parent.height / 2,
      position.x + position.width / 2,
      position.y + position.height / 2,
      { color: "94A3B8", width: 1.1, transparency: 10 },
      `Editable radial connector: ${parent.id} to ${position.id}`
    );
  }
  for (const position of positions) {
    const isCenter = position.id === centerId;
    const node = position.node;
    const fill = isCenter
      ? powerPointColor(centerFill, ACCENT)
      : node ? nodeFill(node) : powerPointColor("EEF2FF", "EEF2FF");
    const line = node ? nodeLine(node) : { color: ACCENT, width: 1.2 };
    const textColor = isCenter
      ? powerPointColor(centerTextColor, "FFFFFF").color
      : node ? powerPointColor((node.data as Record<string, unknown>)?.textColor, INK).color : INK;
    context.slide.addText(position.label, {
      shape: isCenter ? context.pptx.ShapeType.ellipse : context.pptx.ShapeType.roundRect,
      x: position.x,
      y: position.y,
      w: position.width,
      h: position.height,
      fill,
      line,
      color: textColor,
      fontFace: node ? nodeFontFace(node) : DEFAULT_FONT,
      fontSize: isCenter ? 15 : 11,
      bold: isCenter || (node?.data as Record<string, unknown> | undefined)?.fontWeight === "bold",
      align: "center",
      valign: "middle",
      margin: 3,
      fit: "shrink",
      objectName: `Editable radial item: ${position.label}`,
    });
    context.objectCount += 1;
  }
}

function renderSunburst(context: RenderContext, node: Node, rect: PowerPointRect): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const rootId = typeof data.rootId === "string" ? data.rootId : "";
  const hierarchy = buildHierarchy([...context.allNodes], [...context.allEdges]);
  const subtreeIds = rootId ? getSubtree(rootId, hierarchy) : [];
  const sourceNodes = subtreeIds
    .map((id) => context.nodeById.get(id))
    .filter((candidate): candidate is Node => Boolean(candidate));
  if (!sourceNodes.length) {
    renderGenericNode(context, node, rect);
    context.warnings.push(`The radial chart "${editableNodeText(node)}" had no source hierarchy, so it was exported as an editable chart card.`);
    return;
  }

  const depths = new Map(sourceNodes.map((source) => [source.id, hierarchy.get(source.id)?.depth ?? 0]));
  const rootDepth = depths.get(rootId) ?? 0;
  const maxDepth = Math.max(1, ...[...depths.values()].map((depth) => depth - rootDepth));
  const minDimension = Math.min(rect.width, rect.height);
  const centerSize = clamp(minDimension * 0.22, 0.42, 1.15);
  const positions: RadialPosition[] = [];
  const parentById = new Map<string, string | null>();
  const byDepth = new Map<number, Node[]>();
  for (const source of sourceNodes) {
    const depth = (depths.get(source.id) ?? rootDepth) - rootDepth;
    const group = byDepth.get(depth) ?? [];
    group.push(source);
    byDepth.set(depth, group);
    parentById.set(source.id, hierarchy.get(source.id)?.parentId ?? null);
  }
  positions.push({
    id: rootId,
    x: rect.x + rect.width / 2 - centerSize / 2,
    y: rect.y + rect.height / 2 - centerSize / 2,
    width: centerSize,
    height: centerSize,
    node: context.nodeById.get(rootId),
    label: context.summarizeNodeText
      ? overviewNodeText(context.nodeById.get(rootId) ?? node)
      : editableNodeText(context.nodeById.get(rootId) ?? node),
    depth: 0,
  });
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const items = byDepth.get(depth) ?? [];
    const radiusX = Math.max(0.15, (rect.width / 2 - 0.55) * depth / maxDepth);
    const radiusY = Math.max(0.15, (rect.height / 2 - 0.35) * depth / maxDepth);
    const itemWidth = clamp(rect.width / Math.max(5, items.length * 0.75), 0.55, 1.35);
    const itemHeight = clamp(rect.height / Math.max(8, maxDepth * 3), 0.28, 0.62);
    items.forEach((source, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, items.length);
      positions.push({
        id: source.id,
        x: rect.x + rect.width / 2 + Math.cos(angle) * radiusX - itemWidth / 2,
        y: rect.y + rect.height / 2 + Math.sin(angle) * radiusY - itemHeight / 2,
        width: itemWidth,
        height: itemHeight,
        node: source,
        label: context.summarizeNodeText ? overviewNodeText(source) : editableNodeText(source),
        depth,
      });
    });
  }
  renderEditableRadialPositions(context, rect, positions, parentById, rootId);
}

function renderRadialShape(
  context: RenderContext,
  node: Node,
  rect: PowerPointRect,
  chart: RadialChartData
): void {
  const rings = chart.rings ?? [];
  const maxRing = Math.max(1, rings.length);
  const centerId = `${node.id}:center`;
  const centerSize = clamp(Math.min(rect.width, rect.height) * clamp(finiteNumber(chart.centerRadius, 22) / 100, 0.12, 0.38), 0.38, 1.15);
  const positions: RadialPosition[] = [{
    id: centerId,
    x: rect.x + rect.width / 2 - centerSize / 2,
    y: rect.y + rect.height / 2 - centerSize / 2,
    width: centerSize,
    height: centerSize,
    label: plainPowerPointText(chart.centerText) || editableNodeText(node),
    depth: 0,
  }];
  const parentById = new Map<string, string | null>([[centerId, null]]);
  let previousRingIds = [centerId];
  rings.forEach((ring, ringIndex) => {
    const segments = ring.segments?.length
      ? ring.segments
      : Array.from({ length: Math.max(1, ring.segmentCount) }, (_, index) => ({ id: `${ring.id}:${index}`, text: `Part ${index + 1}` }));
    const radiusX = Math.max(0.12, (rect.width / 2 - 0.48) * (ringIndex + 1) / maxRing);
    const radiusY = Math.max(0.12, (rect.height / 2 - 0.3) * (ringIndex + 1) / maxRing);
    const width = clamp(rect.width / Math.max(5, segments.length * 0.72), 0.48, 1.3);
    const height = clamp(rect.height / Math.max(8, maxRing * 3), 0.25, 0.58);
    const currentIds: string[] = [];
    segments.forEach((segment, index) => {
      const id = `${node.id}:${ring.id}:${segment.id}`;
      const angle = (-90 + finiteNumber(chart.rotation, 0) + finiteNumber(ring.rotation, 0)) * Math.PI / 180
        + index * Math.PI * 2 / segments.length;
      positions.push({
        id,
        x: rect.x + rect.width / 2 + Math.cos(angle) * radiusX - width / 2,
        y: rect.y + rect.height / 2 + Math.sin(angle) * radiusY - height / 2,
        width,
        height,
        label: plainPowerPointText(segment.text) || `Part ${index + 1}`,
        depth: ringIndex + 1,
      });
      parentById.set(id, previousRingIds[index % previousRingIds.length]);
      currentIds.push(id);
    });
    previousRingIds = currentIds;
  });
  renderEditableRadialPositions(
    context,
    rect,
    positions,
    parentById,
    centerId,
    chart.centerColor ?? ACCENT,
    chart.centerTextColor ?? "FFFFFF"
  );
}

function renderRelationshipDiagram(context: RenderContext, node: Node, rect: PowerPointRect): void {
  const rawSpec = (node.data as Record<string, unknown> | undefined)?.relationshipDiagramSpec;
  const spec: RelationshipDiagramSpec = normalizeRelationshipDiagramSpec(rawSpec);
  const hierarchy = buildHierarchy([...context.allNodes], [...context.allEdges]);
  const groups = buildRelationshipGroupsForSpec({
    spec,
    nodes: context.allNodes,
    relationships: context.relationships,
    hierarchy,
  });
  if (!groups.length) {
    renderGenericNode(context, node, rect);
    context.warnings.push(`The relationship diagram "${spec.title}" had no saved relationships, so it was exported as an editable chart card.`);
    return;
  }

  const centerSize = clamp(Math.min(rect.width, rect.height) * 0.25, 0.5, 1.3);
  const center = {
    x: rect.x + rect.width / 2 - centerSize / 2,
    y: rect.y + rect.height / 2 - centerSize / 2,
    width: centerSize,
    height: centerSize,
  };
  const radiusX = Math.max(0.15, rect.width / 2 - 0.72);
  const radiusY = Math.max(0.15, rect.height / 2 - 0.4);
  const itemWidth = clamp(rect.width / Math.max(4.5, groups.length * 0.72), 0.7, 1.75);
  const itemHeight = clamp(rect.height / Math.max(5.5, Math.ceil(groups.length / 2) * 1.7), 0.38, 1.05);
  const itemRects = groups.map((group, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / groups.length;
    return {
      group,
      x: rect.x + rect.width / 2 + Math.cos(angle) * radiusX - itemWidth / 2,
      y: rect.y + rect.height / 2 + Math.sin(angle) * radiusY - itemHeight / 2,
      width: itemWidth,
      height: itemHeight,
    };
  });
  for (const item of itemRects) {
    addEditableLine(
      context,
      center.x + center.width / 2,
      center.y + center.height / 2,
      item.x + item.width / 2,
      item.y + item.height / 2,
      { color: powerPointColor(spec.borderColor, "94A3B8").color, width: clamp(spec.borderWidth ?? 1.2, 0.5, 6) },
      `Editable relationship connector: ${item.group.itemId}`
    );
  }
  context.slide.addText(spec.title || editableNodeText(node), {
    shape: context.pptx.ShapeType.ellipse,
    x: center.x,
    y: center.y,
    w: center.width,
    h: center.height,
    fill: { color: powerPointColor(spec.centerFillColor, ACCENT).color, transparency: 0 },
    line: { color: powerPointColor(spec.centerBorderColor, ACCENT).color, width: spec.centerBorderWidth ?? 1.5 },
    color: powerPointColor(spec.centerTextColor, "FFFFFF").color,
    fontFace: spec.fontFamily || DEFAULT_FONT,
    fontSize: clamp(spec.textSize, 10, 18),
    bold: true,
    align: "center",
    valign: "middle",
    margin: 4,
    fit: "shrink",
    objectName: `Editable relationship hub: ${spec.title}`,
  });
  context.objectCount += 1;
  for (const [index, item] of itemRects.entries()) {
    const style = spec.itemStyles?.[item.group.itemId] ?? spec.itemStyles?.[item.group.sourceNodeId];
    const label = item.group.itemLabel || item.group.sourceLabel;
    const targets = item.group.targets.map((target) => target.label).filter(Boolean);
    const text = [
      label,
      targets.length && targets.some((target) => target !== label) ? targets.join("\n") : "",
      spec.showCounts ? `${item.group.count} connection${item.group.count === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join("\n");
    const palette = ["E0E7FF", "DBEAFE", "CCFBF1", "FEF3C7", "FCE7F3", "EDE9FE"];
    const fill = powerPointColor(style?.fillColor ?? item.group.sourceColor, palette[index % palette.length]);
    context.slide.addText(text, {
      shape: spec.layout === "flower" ? context.pptx.ShapeType.ellipse : context.pptx.ShapeType.roundRect,
      x: item.x,
      y: item.y,
      w: item.width,
      h: item.height,
      fill: { color: fill.color, transparency: combineTransparency(fill.transparency, spec.fillOpacity, 0.92) },
      line: {
        color: powerPointColor(style?.borderColor ?? spec.borderColor, ACCENT).color,
        width: clamp(spec.borderWidth ?? 1.2, 0.5, 6),
      },
      color: powerPointColor(style?.textColor ?? spec.textColor, INK).color,
      fontFace: spec.fontFamily || DEFAULT_FONT,
      fontSize: clamp(style?.fontSize ?? spec.textSize, 9, 18),
      bold: spec.fontWeight === "bold",
      italic: spec.fontStyle === "italic",
      rotate: style?.rotation,
      align: "center",
      valign: "middle",
      margin: 3,
      fit: "shrink",
      objectName: `Editable relationship item: ${label}`,
    });
    context.objectCount += 1;
  }
  if (spec.subtitle) {
    context.slide.addText(spec.subtitle, {
      x: rect.x + 0.12,
      y: rect.y + rect.height - 0.3,
      w: Math.max(0.5, rect.width - 0.24),
      h: 0.24,
      color: MUTED_INK,
      fontFace: spec.fontFamily || DEFAULT_FONT,
      fontSize: 10,
      align: "center",
      margin: 0,
      fit: "shrink",
      objectName: `Editable relationship subtitle: ${spec.subtitle}`,
    });
    context.objectCount += 1;
  }
}

function renderSpecialNode(context: RenderContext, node: Node, rect: PowerPointRect): boolean {
  if (node.type === "sunburst") {
    renderSunburst(context, node, rect);
    return true;
  }
  if (node.type === "relationshipDiagram") {
    renderRelationshipDiagram(context, node, rect);
    return true;
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  const radialChart = data.radialChart as RadialChartData | undefined;
  if (node.type === "shape" && radialChart?.enabled && radialChart.rings?.length) {
    renderRadialShape(context, node, rect, radialChart);
    return true;
  }
  return false;
}

function addSlideChrome(
  context: RenderContext,
  title: string,
  boardTitle: string,
  slideNumber: number,
  slideCount: number
): void {
  context.slide.background = { color: SLIDE_BACKGROUND };
  context.slide.addShape(context.pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.13,
    h: 7.5,
    fill: { color: ACCENT },
    line: { color: ACCENT, transparency: 100 },
    objectName: "Editable teaching accent",
  });
  context.slide.addText(title, {
    x: 0.52,
    y: 0.16,
    w: 11.75,
    h: 0.68,
    color: INK,
    fontFace: DEFAULT_FONT,
    fontSize: 36,
    bold: true,
    margin: 0,
    fit: "shrink",
    wrap: false,
    valign: "middle",
    objectName: `Editable slide title: ${title}`,
  });
  context.slide.addText(`${boardTitle}  •  Editable teaching slide  •  ${slideNumber}/${slideCount}`, {
    x: 0.52,
    y: 7.08,
    w: 12.15,
    h: 0.18,
    color: MUTED_INK,
    fontFace: DEFAULT_FONT,
    fontSize: 9,
    margin: 0,
    align: "right",
    objectName: "Editable slide footer",
  });
  context.objectCount += 3;
}

interface MatrixFoldOverviewCard {
  foldNumber: number;
  title: string;
  itemCount: number;
  styleNode?: Node;
}

function matrixFoldOverviewCard(
  context: RenderContext,
  foldStop: PresentationStop,
  allFoldStops: readonly PresentationStop[]
): MatrixFoldOverviewCard {
  const rootId = foldStop.matrixFold?.rootId ?? "";
  const contentNodes = foldStop.nodeIds
    .map((nodeId) => context.nodeById.get(nodeId))
    .filter((node): node is Node => node !== undefined && node.type !== "frame" && node.id !== rootId);
  const sectionRoots = contentNodes.filter((node) =>
    (node.data as Record<string, unknown> | undefined)?.parentId === rootId);
  const styleNode = sectionRoots[0] ?? contentNodes[0];
  const separatorIndex = foldStop.title.indexOf("·");
  const authoredTitle = separatorIndex >= 0
    ? foldStop.title.slice(separatorIndex + 1).trim()
    : "";
  const firstNode = sectionRoots[0] ?? styleNode;
  const lastNode = sectionRoots.at(-1) ?? styleNode;
  const firstTitle = firstNode ? overviewNodeText(firstNode, 32) : "";
  const lastTitle = lastNode ? overviewNodeText(lastNode, 32) : "";
  const derivedTitle = firstTitle && lastTitle && firstTitle !== lastTitle
    ? `${firstTitle} – ${lastTitle}`
    : firstTitle || `Fold ${allFoldStops.indexOf(foldStop) + 1}`;
  const bodyFrame = foldStop.matrixFold?.bodyFrameId
    ? context.nodeById.get(foldStop.matrixFold.bodyFrameId)
    : undefined;
  const storedIds = (bodyFrame?.data as Record<string, unknown> | undefined)?.matrixFoldSectionNodeIds;
  const itemIds = Array.isArray(storedIds)
    ? storedIds.filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeId !== rootId)
    : contentNodes.map((node) => node.id);

  return {
    foldNumber: allFoldStops.indexOf(foldStop) + 1,
    title: plainPowerPointText(authoredTitle) || derivedTitle,
    itemCount: new Set(itemIds).size,
    styleNode,
  };
}

function renderMatrixOverview(
  context: RenderContext,
  stop: PowerPointPresentationStop,
  stopNodes: readonly Node[],
  options: EditablePowerPointOptions
): boolean {
  const page = stop.powerPointMatrixOverview;
  if (stop.kind !== "overview" || !page) return false;

  const root = context.nodeById.get(page.rootId);
  const allFoldStops = options.stops.filter((candidate) =>
    candidate.kind === "matrix-fold" && candidate.matrixFold?.rootId === page.rootId);
  const selectedStopIds = new Set(page.foldStopIds);
  const selectedFoldStops = allFoldStops.filter((candidate) => selectedStopIds.has(candidate.id));
  if (!root || !selectedFoldStops.length) return false;

  const cards = selectedFoldStops.map((foldStop) =>
    matrixFoldOverviewCard(context, foldStop, allFoldStops));
  const content = POWERPOINT_SLIDE.content;
  const rootRect: PowerPointRect = {
    x: content.x + 1.45,
    y: content.y + 0.06,
    width: content.width - 2.9,
    height: 0.82,
  };
  const columns = Math.min(3, cards.length);
  const rows = Math.ceil(cards.length / columns);
  const gapX = 0.36;
  const gapY = 0.34;

  const matrixCoveredIds = new Set<string>();
  const matrixRootIds = new Set<string>();
  for (const candidate of options.stops) {
    if (candidate.kind !== "matrix-fold" || !candidate.matrixFold) continue;
    matrixRootIds.add(candidate.matrixFold.rootId);
    matrixCoveredIds.add(candidate.matrixFold.rootId);
    candidate.nodeIds.forEach((nodeId) => matrixCoveredIds.add(nodeId));
  }
  const otherNodes = page.includeOtherTopics
    ? stopNodes.filter((node) =>
        node.type !== "frame"
        && !matrixRootIds.has(node.id)
        && !matrixCoveredIds.has(node.id))
    : [];
  const hasOtherTopics = otherNodes.length > 0;
  const cardAreaTop = content.y + 1.48;
  const cardAreaBottom = content.y + content.height - (hasOtherTopics ? 0.9 : 0.28);
  const cardAreaHeight = cardAreaBottom - cardAreaTop;
  const cardHeight = Math.min(
    rows === 1 ? 2.12 : 1.72,
    (cardAreaHeight - gapY * (rows - 1)) / rows
  );
  const gridWidth = cards.length === 1 ? Math.min(6.4, content.width) : content.width;
  const cardWidth = (gridWidth - gapX * (columns - 1)) / columns;
  const gridHeight = cardHeight * rows + gapY * (rows - 1);
  const gridX = content.x + (content.width - gridWidth) / 2;
  const gridY = cardAreaTop + Math.max(0, (cardAreaHeight - gridHeight) * 0.18);
  const cardRects = cards.map((_card, index): PowerPointRect => ({
    x: gridX + (index % columns) * (cardWidth + gapX),
    y: gridY + Math.floor(index / columns) * (cardHeight + gapY),
    width: cardWidth,
    height: cardHeight,
  }));

  // Draw connections first so every editable line remains behind its fold card.
  for (const [index, rect] of cardRects.entries()) {
    addEditableLine(
      context,
      rootRect.x + rootRect.width / 2,
      rootRect.y + rootRect.height,
      rect.x + rect.width / 2,
      rect.y,
      { color: "94A3B8", transparency: 38, width: 1.35 },
      `Editable Matrix overview connector ${cards[index].foldNumber}`
    );
  }

  const rootFill = nodeFill(root);
  context.slide.addText(overviewNodeText(root, 72), {
    shape: context.pptx.ShapeType.roundRect,
    x: rootRect.x,
    y: rootRect.y,
    w: rootRect.width,
    h: rootRect.height,
    fill: rootFill,
    line: nodeLine(root),
    color: powerPointColor((root.data as Record<string, unknown>)?.textColor, INK).color,
    fontFace: nodeFontFace(root),
    fontSize: 28,
    bold: true,
    align: "center",
    valign: "middle",
    margin: 8,
    fit: "shrink",
    wrap: false,
    objectName: `Editable Matrix overview root: ${overviewNodeText(root, 42)}`,
  });
  context.objectCount += 1;

  const firstFoldNumber = cards[0].foldNumber;
  const lastFoldNumber = cards.at(-1)!.foldNumber;
  const rangeLabel = page.pageCount > 1
    ? `${allFoldStops.length} folds · showing ${firstFoldNumber}–${lastFoldNumber}`
    : `${allFoldStops.length} fold${allFoldStops.length === 1 ? "" : "s"}`;
  context.slide.addText(rangeLabel, {
    x: content.x,
    y: rootRect.y + rootRect.height + 0.08,
    w: content.width,
    h: 0.28,
    color: MUTED_INK,
    fontFace: DEFAULT_FONT,
    fontSize: 16,
    align: "center",
    margin: 0,
    objectName: "Editable Matrix overview fold range",
  });
  context.objectCount += 1;

  for (const [index, card] of cards.entries()) {
    const rect = cardRects[index];
    const fill = card.styleNode ? nodeFill(card.styleNode) : { color: "EEF2FF", transparency: 0 };
    const line = card.styleNode ? nodeLine(card.styleNode) : { color: ACCENT, width: 1.4 };
    const textColor = card.styleNode
      ? powerPointColor((card.styleNode.data as Record<string, unknown>)?.textColor, INK).color
      : INK;
    const fontFace = card.styleNode ? nodeFontFace(card.styleNode) : nodeFontFace(root);
    context.slide.addShape(context.pptx.ShapeType.roundRect, {
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      fill,
      line,
      rectRadius: 0.035,
      objectName: `Editable Matrix fold summary ${card.foldNumber}`,
    });
    context.slide.addText(`Fold ${card.foldNumber}`, {
      x: rect.x + 0.16,
      y: rect.y + 0.13,
      w: rect.width - 0.32,
      h: 0.42,
      color: textColor,
      fontFace,
      fontSize: 24,
      bold: true,
      align: "center",
      valign: "middle",
      margin: 0,
      fit: "shrink",
      wrap: false,
      objectName: `Editable Matrix fold heading ${card.foldNumber}`,
    });
    const summaryRect: PowerPointRect = {
      x: rect.x + 0.18,
      y: rect.y + 0.62,
      width: rect.width - 0.36,
      height: Math.max(0.38, rect.height - 1.02),
    };
    context.slide.addText(card.title, {
      x: summaryRect.x,
      y: summaryRect.y,
      w: summaryRect.width,
      h: summaryRect.height,
      color: textColor,
      fontFace,
      fontSize: fittedPowerPointFontSize(card.title, summaryRect, 19, 16, 20),
      bold: false,
      align: "center",
      valign: "middle",
      margin: 1,
      fit: "shrink",
      wrap: true,
      objectName: `Editable Matrix fold label ${card.foldNumber}: ${card.title.slice(0, 42)}`,
    });
    context.slide.addText(`${card.itemCount} chart item${card.itemCount === 1 ? "" : "s"}`, {
      x: rect.x + 0.16,
      y: rect.y + rect.height - 0.3,
      w: rect.width - 0.32,
      h: 0.2,
      color: MUTED_INK,
      fontFace: DEFAULT_FONT,
      fontSize: 16,
      align: "center",
      margin: 0,
      fit: "shrink",
      wrap: false,
      objectName: `Editable Matrix fold count ${card.foldNumber}`,
    });
    context.objectCount += 4;
  }

  if (hasOtherTopics) {
    const firstTitle = overviewNodeText(otherNodes[0]!, 34);
    const lastTitle = overviewNodeText(otherNodes[otherNodes.length - 1]!, 34);
    const otherSummary = firstTitle === lastTitle ? firstTitle : `${firstTitle} – ${lastTitle}`;
    context.slide.addText(`Other topics · ${otherSummary} · ${otherNodes.length} item${otherNodes.length === 1 ? "" : "s"}`, {
      shape: context.pptx.ShapeType.roundRect,
      x: content.x,
      y: content.y + content.height - 0.62,
      w: content.width,
      h: 0.5,
      fill: { color: "E2E8F0", transparency: 12 },
      line: { color: "94A3B8", transparency: 20, width: 1 },
      color: INK,
      fontFace: nodeFontFace(otherNodes[0]),
      fontSize: 16,
      align: "center",
      valign: "middle",
      margin: 5,
      fit: "shrink",
      wrap: false,
      objectName: "Editable Matrix overview other topics",
    });
    context.objectCount += 1;
  }
  return true;
}

function renderTeachingStop(
  pptx: PptxGenJS,
  stop: PowerPointPresentationStop,
  options: EditablePowerPointOptions,
  slideNumber: number,
  warnings: string[]
): number {
  const stopIds = new Set(stop.nodeIds);
  const presentationNodes = applyPresentationStopGeometry(options.nodes, stop);
  const stopNodes = presentationNodes.filter((node) => stopIds.has(node.id) && !node.hidden);
  if (!stopNodes.length) return 0;
  const transform = buildPowerPointTransform(stopNodes);
  const slide = pptx.addSlide();
  const nodeById = new Map(presentationNodes.map((node) => [node.id, node]));
  const context: RenderContext = {
    pptx,
    slide,
    allNodes: presentationNodes,
    allEdges: options.edges,
    relationships: options.relationships,
    transform,
    nodeById,
    warnings,
    objectCount: 0,
    summarizeNodeText: presentationStopUsesSummaries(stop, nodeById),
  };
  addSlideChrome(context, stop.title, options.boardTitle, slideNumber, options.stops.length);
  if (renderMatrixOverview(context, stop, stopNodes, options)) {
    slide.addNotes(`Teaching map: ${stop.title}. Each fold summary is an editable PowerPoint shape; complete fold content follows on its own teaching slide.`);
    return context.objectCount;
  }
  const rectByNodeId = new Map(stopNodes.map((node) => [node.id, transformNodeRect(node, transform)]));

  // Frames are editable backgrounds. Connectors are added before entity nodes,
  // keeping the PowerPoint z-order usable for teaching edits.
  for (const node of stopNodes.filter((candidate) => candidate.type === "frame")) {
    renderFrame(context, node, rectByNodeId.get(node.id)!);
  }
  for (const edge of options.edges) {
    if (!stopIds.has(edge.source) || !stopIds.has(edge.target)) continue;
    renderBoardEdge(context, edge, rectByNodeId);
  }
  for (const node of stopNodes.filter((candidate) => candidate.type !== "frame")) {
    const rect = rectByNodeId.get(node.id)!;
    if (!renderSpecialNode(context, node, rect)) renderGenericNode(context, node, rect);
  }
  slide.addNotes(`Teaching stop: ${stop.title}. Every diagram element on this slide is a native editable PowerPoint shape, line, or text box.`);
  return context.objectCount;
}

export async function downloadEditablePowerPoint(
  options: EditablePowerPointOptions
): Promise<EditablePowerPointResult> {
  if (!options.stops.length) throw new Error("There is no visible board content to export to PowerPoint.");
  const expandedStops = expandEditablePowerPointStops(options.stops, options.nodes);
  const renderOptions: EditablePowerPointOptions = { ...options, stops: expandedStops };
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Manojalam";
  pptx.company = "Manojalam";
  pptx.subject = "Editable teaching presentation";
  pptx.title = options.boardTitle;
  pptx.revision = "1";
  pptx.theme = {
    headFontFace: DEFAULT_FONT,
    bodyFontFace: DEFAULT_FONT,
  };
  const warnings: string[] = [];
  let editableObjectCount = 0;
  let renderedSlides = 0;
  for (const stop of expandedStops) {
    const objects = renderTeachingStop(pptx, stop, renderOptions, renderedSlides + 1, warnings);
    if (!objects) continue;
    editableObjectCount += objects;
    renderedSlides += 1;
    options.onProgress?.(renderedSlides, expandedStops.length);
  }
  if (!renderedSlides) throw new Error("There is no visible board content to export to PowerPoint.");
  await pptx.writeFile({
    fileName: options.filename ?? safePowerPointFilename(options.boardTitle),
    compression: true,
  });
  return {
    slideCount: renderedSlides,
    editableObjectCount,
    warnings: [...new Set(warnings)],
  };
}
