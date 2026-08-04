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
import type { PresentationStop } from "../canvas/presentation";
import { buildHierarchy, getSubtree } from "../layout/hierarchy";
import {
  buildRelationshipGroupsForSpec,
  normalizeRelationshipDiagramSpec,
} from "../relationship-diagram";
import {
  buildPowerPointTransform,
  editableNodeText,
  plainPowerPointText,
  powerPointColor,
  powerPointShapeName,
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
}

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

function nodeTextOptions(node: Node, transform: PowerPointTransform): Pick<
  PptxGenJS.TextPropsOptions,
  "fontFace" | "fontSize" | "color" | "bold" | "italic" | "align" | "valign" | "rotate"
> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const color = powerPointColor(data.textColor ?? data.radialTextColor, INK);
  const align = data.textAlign === "left" || data.textAlign === "right" || data.textAlign === "justify"
    ? data.textAlign
    : "center";
  const valign = data.textVerticalAlign === "top" || data.textVerticalAlign === "bottom"
    ? data.textVerticalAlign
    : "middle";
  return {
    fontFace: nodeFontFace(node),
    fontSize: scaledFontSize(data.fontSize, transform.scale),
    color: color.color,
    bold: data.fontWeight === "bold",
    italic: data.fontStyle === "italic",
    align,
    valign,
    rotate: finiteNumber(data.textRotation, 0),
  };
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
  context.slide.addShape(context.pptx.ShapeType.line, {
    x,
    y,
    w: width,
    h: height,
    flipV: negativeSlope,
    line,
    objectName,
  });
  context.objectCount += 1;
}

function renderFrame(context: RenderContext, node: Node, rect: PowerPointRect): void {
  const data = (node.data ?? {}) as unknown as FrameNodeData;
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

function renderGenericNode(context: RenderContext, node: Node, rect: PowerPointRect): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const shapeType = typeof data.shapeType === "string" ? data.shapeType as ShapeType : undefined;
  const isTextOnly = node.type === "text" && !data.textFrameStyle;
  const fill = nodeFill(node);
  const line = nodeLine(node);
  const text = editableNodeText(node);
  const textOptions = nodeTextOptions(node, context.transform);
  context.slide.addText(text, {
    shape: isTextOnly
      ? context.pptx.ShapeType.rect
      : nativeShape(context.pptx, powerPointShapeName(shapeType)),
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
    fill: isTextOnly ? { color: "FFFFFF", transparency: 100 } : fill,
    line: isTextOnly ? { color: "FFFFFF", transparency: 100, width: 0.5 } : line,
    margin: clamp(finiteNumber(data.textPadding, 6), 0, 18),
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
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourcePoint = horizontal
    ? { x: source.x + (dx >= 0 ? source.width : 0), y: source.y + source.height / 2 }
    : { x: source.x + source.width / 2, y: source.y + (dy >= 0 ? source.height : 0) };
  const targetPoint = horizontal
    ? { x: target.x + (dx >= 0 ? 0 : target.width), y: target.y + target.height / 2 }
    : { x: target.x + target.width / 2, y: target.y + (dy >= 0 ? 0 : target.height) };
  addEditableLine(context, sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y, {
    color: color.color,
    transparency: color.transparency,
    width: clamp(finiteNumber(data.width, 1.5), 0.5, 8),
    dashType: pathStyle === "dotted" ? "sysDot" : pathStyle === "dashed" ? "dash" : "solid",
    beginArrowType: data.arrowStart ? "triangle" : "none",
    endArrowType: data.arrowEnd ? "triangle" : "none",
  }, `Editable connector: ${edge.id}`);

  const label = plainPowerPointText(data.label);
  if (!label) return;
  const x = (sourcePoint.x + targetPoint.x) / 2;
  const y = (sourcePoint.y + targetPoint.y) / 2;
  context.slide.addText(label, {
    x: x - 0.65,
    y: y - 0.15,
    w: 1.3,
    h: 0.3,
    color: powerPointColor(data.labelColor, color.color).color,
    fontFace: data.labelFontFamily || DEFAULT_FONT,
    fontSize: clamp(finiteNumber(data.labelFontSize, 12), 8, 20),
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
    label: editableNodeText(context.nodeById.get(rootId) ?? node),
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
        label: editableNodeText(source),
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
    y: 0.25,
    w: 11.75,
    h: 0.55,
    color: INK,
    fontFace: DEFAULT_FONT,
    fontSize: 36,
    bold: true,
    margin: 0,
    fit: "shrink",
    breakLine: false,
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

function renderTeachingStop(
  pptx: PptxGenJS,
  stop: PresentationStop,
  options: EditablePowerPointOptions,
  slideNumber: number,
  warnings: string[]
): number {
  const stopIds = new Set(stop.nodeIds);
  const stopNodes = options.nodes.filter((node) => stopIds.has(node.id) && !node.hidden);
  if (!stopNodes.length) return 0;
  const transform = buildPowerPointTransform(stopNodes);
  const slide = pptx.addSlide();
  const context: RenderContext = {
    pptx,
    slide,
    allNodes: options.nodes,
    allEdges: options.edges,
    relationships: options.relationships,
    transform,
    nodeById: new Map(options.nodes.map((node) => [node.id, node])),
    warnings,
    objectCount: 0,
  };
  addSlideChrome(context, stop.title, options.boardTitle, slideNumber, options.stops.length);
  const rectByNodeId = new Map(stopNodes.map((node) => [node.id, transformNodeRect(node, transform)]));

  // Frames are editable backgrounds. Connectors are added before entity nodes,
  // keeping the PowerPoint z-order usable for teaching edits.
  for (const node of stopNodes.filter((candidate) => candidate.type === "frame")) {
    renderFrame(context, node, rectByNodeId.get(node.id)!);
  }
  for (const edge of options.edges) {
    if (edge.hidden || !stopIds.has(edge.source) || !stopIds.has(edge.target)) continue;
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
  for (const stop of options.stops) {
    const objects = renderTeachingStop(pptx, stop, options, renderedSlides + 1, warnings);
    if (!objects) continue;
    editableObjectCount += objects;
    renderedSlides += 1;
    options.onProgress?.(renderedSlides, options.stops.length);
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
