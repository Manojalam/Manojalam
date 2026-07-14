import { getNodesBounds, type Edge, type Node } from "@xyflow/react";

import { ExportError } from "./errors";
import type { ExportBounds, ExportScope, ExportScopeKind } from "./types";

type ClientRectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;

export interface ExportViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface ResolvedExportTarget<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
> {
  scope: ExportScope;
  scopeKind: ExportScopeKind;
  nodes: NodeType[];
  edges: EdgeType[];
  nodeIds: string[];
  edgeIds: string[];
  /** Absolute model rectangles captured before the scope is narrowed. */
  modelNodeRects: ReadonlyMap<string, ExportBounds>;
}

export interface ExportDomBoundsContext {
  /** Any DOM ancestor that contains the React Flow nodes and edges. */
  root: ParentNode;
  /** The untransformed React Flow container. Resolved from `root` when omitted. */
  flowContainer?: Element | null;
  /** Current React Flow viewport. Parsed from the viewport element when omitted. */
  viewport?: ExportViewportTransform;
}

export interface TightExportBoundsOptions {
  padding?: number;
  dom?: ExportDomBoundsContext | null;
}

export interface ResolvedExportTargetWithBounds<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
> {
  target: ResolvedExportTarget<NodeType, EdgeType>;
  bounds: ExportBounds;
}

type ModelNodeRect = ExportBounds;

type Extent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  hasValue: boolean;
};

const EMPTY_EXTENT: Readonly<Extent> = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
  hasValue: false,
};

function finiteDimension(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/i.test(trimmed)) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function modelNodeSize(node: Node): { width: number; height: number } {
  const dimensions = node as Node & { initialWidth?: number; initialHeight?: number };
  const width = finiteDimension(node.measured?.width)
    ?? finiteDimension(node.width)
    ?? finiteDimension(dimensions.initialWidth)
    ?? finiteDimension(node.style?.width)
    ?? 0;
  const height = finiteDimension(node.measured?.height)
    ?? finiteDimension(node.height)
    ?? finiteDimension(dimensions.initialHeight)
    ?? finiteDimension(node.style?.height)
    ?? 0;
  return { width, height };
}

function internalAbsolutePosition(node: Node): { x: number; y: number } | null {
  const internal = node as Node & {
    internals?: { positionAbsolute?: { x?: number; y?: number } };
  };
  const position = internal.internals?.positionAbsolute;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return { x: position.x as number, y: position.y as number };
}

function createModelRectResolver(nodes: readonly Node[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, ModelNodeRect>();
  const resolving = new Set<string>();

  const resolve = (node: Node): ModelNodeRect => {
    const cached = cache.get(node.id);
    if (cached) return cached;

    const { width, height } = modelNodeSize(node);
    const internalPosition = internalAbsolutePosition(node);
    const origin = node.origin ?? [0, 0];
    let x = internalPosition?.x
      ?? node.position.x - width * (Number.isFinite(origin[0]) ? origin[0] : 0);
    let y = internalPosition?.y
      ?? node.position.y - height * (Number.isFinite(origin[1]) ? origin[1] : 0);

    if (!internalPosition && node.parentId && !resolving.has(node.id)) {
      const parent = nodeById.get(node.parentId);
      if (parent) {
        resolving.add(node.id);
        const parentRect = resolve(parent);
        resolving.delete(node.id);
        x += parentRect.x;
        y += parentRect.y;
      }
    }

    const rect = { x, y, width, height };
    cache.set(node.id, rect);
    return rect;
  };

  return resolve;
}

function isVisibleNode(node: Node): boolean {
  return node.hidden !== true;
}

function isVisibleEdge(edge: Edge): boolean {
  return edge.hidden !== true;
}

function throwEmptyScope(scope: ExportScope, message: string): never {
  throw new ExportError({
    stage: "resolve-scope",
    code: "EMPTY_SCOPE",
    message,
    diagnostics: { scopeKind: scope.kind },
  });
}

/**
 * Resolves a logical export target without depending on the current viewport.
 * Only visible nodes are retained and every returned edge connects two retained
 * visible nodes.
 */
export function resolveExportTarget<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
>(
  scope: ExportScope,
  nodes: readonly NodeType[],
  edges: readonly EdgeType[]
): ResolvedExportTarget<NodeType, EdgeType> {
  const visibleNodes = nodes.filter(isVisibleNode);
  const visibleNodeById = new Map(visibleNodes.map((node) => [node.id, node]));
  const visibleEdges = edges.filter(isVisibleEdge);
  const includedNodeIds = new Set<string>();
  const explicitlySelectedNodeIds = scope.kind === "selection"
    ? new Set(scope.nodeIds.filter((nodeId) => visibleNodeById.has(nodeId)))
    : null;
  const explicitlySelectedEdgeIds = scope.kind === "selection"
    ? new Set(scope.edgeIds ?? [])
    : null;

  if (scope.kind === "board") {
    for (const node of visibleNodes) includedNodeIds.add(node.id);
  } else if (scope.kind === "selection") {
    for (const nodeId of explicitlySelectedNodeIds ?? []) includedNodeIds.add(nodeId);

    for (const edge of visibleEdges) {
      if (!explicitlySelectedEdgeIds?.has(edge.id)) continue;
      if (visibleNodeById.has(edge.source)) includedNodeIds.add(edge.source);
      if (visibleNodeById.has(edge.target)) includedNodeIds.add(edge.target);
    }
  } else {
    const frame = visibleNodeById.get(scope.frameId);
    if (!frame) {
      throwEmptyScope(scope, "The selected frame is not visible or no longer exists.");
    }

    const resolveRect = createModelRectResolver(nodes);
    const frameRect = resolveRect(frame);
    const frameRight = frameRect.x + frameRect.width;
    const frameBottom = frameRect.y + frameRect.height;
    includedNodeIds.add(frame.id);

    for (const node of visibleNodes) {
      if (node.id === frame.id) continue;
      const rect = resolveRect(node);
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      if (
        centerX >= frameRect.x
        && centerX <= frameRight
        && centerY >= frameRect.y
        && centerY <= frameBottom
      ) {
        includedNodeIds.add(node.id);
      }
    }
  }

  if (includedNodeIds.size === 0) {
    throwEmptyScope(scope, "There is no visible content in the selected export area.");
  }

  const resolvedNodes = visibleNodes.filter((node) => includedNodeIds.has(node.id));
  const resolvedEdges = visibleEdges.filter((edge) => {
    if (!includedNodeIds.has(edge.source) || !includedNodeIds.has(edge.target)) return false;
    if (scope.kind !== "selection") return true;

    // A selected edge contributes its endpoints to the export bounds, but
    // those implied endpoint nodes must not pull in parallel or unrelated
    // edges. Preserve the existing node-selection behavior by still including
    // every edge whose two endpoints were explicitly selected as nodes.
    return explicitlySelectedEdgeIds?.has(edge.id) === true
      || (
        explicitlySelectedNodeIds?.has(edge.source) === true
        && explicitlySelectedNodeIds.has(edge.target)
      );
  });
  const resolveRect = createModelRectResolver(nodes);
  const modelNodeRects = new Map(
    resolvedNodes.map((node) => [node.id, resolveRect(node)] as const)
  );

  return {
    scope,
    scopeKind: scope.kind,
    nodes: resolvedNodes,
    edges: resolvedEdges,
    nodeIds: resolvedNodes.map((node) => node.id),
    edgeIds: resolvedEdges.map((edge) => edge.id),
    modelNodeRects,
  };
}

function isFiniteRect(rect: ExportBounds, allowDegenerate = false): boolean {
  return (
    Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width >= 0
    && rect.height >= 0
    && (allowDegenerate || (rect.width > 0 && rect.height > 0))
  );
}

function includeRect(extent: Extent, rect: ExportBounds, allowDegenerate = false): void {
  if (!isFiniteRect(rect, allowDegenerate)) return;
  extent.minX = Math.min(extent.minX, rect.x);
  extent.minY = Math.min(extent.minY, rect.y);
  extent.maxX = Math.max(extent.maxX, rect.x + rect.width);
  extent.maxY = Math.max(extent.maxY, rect.y + rect.height);
  extent.hasValue = true;
}

function extentBounds(extent: Extent): ExportBounds | null {
  if (!extent.hasValue) return null;
  const width = extent.maxX - extent.minX;
  const height = extent.maxY - extent.minY;
  if (!(width > 0) || !(height > 0)) return null;
  return { x: extent.minX, y: extent.minY, width, height };
}

function modelBounds(target: ResolvedExportTarget): ExportBounds | null {
  const normalized = target.nodes
    .map((node) => {
      const rect = target.modelNodeRects.get(node.id);
      if (!rect) return null;
      if (!isFiniteRect(rect)) return null;
      return {
        ...node,
        parentId: undefined,
        origin: [0, 0] as [number, number],
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
        measured: { width: rect.width, height: rect.height },
      };
    })
    .filter((node): node is NonNullable<typeof node> => node !== null);

  if (normalized.length === 0) return null;
  const bounds = getNodesBounds(normalized);
  return isFiniteRect(bounds) ? bounds : null;
}

function asElement(value: unknown): Element | null {
  if (
    value
    && typeof value === "object"
    && typeof (value as Element).querySelectorAll === "function"
    && typeof (value as Element).getBoundingClientRect === "function"
  ) {
    return value as Element;
  }
  return null;
}

function elementsMatching(root: ParentNode, selector: string): Element[] {
  const matches = Array.from(root.querySelectorAll<Element>(selector));
  const rootElement = asElement(root);
  if (rootElement?.matches(selector)) matches.unshift(rootElement);
  return matches;
}

function findFlowContainer(root: ParentNode): Element | null {
  const rootElement = asElement(root);
  if (rootElement?.matches(".react-flow")) return rootElement;
  const closest = rootElement?.closest(".react-flow");
  if (closest) return closest;
  return root.querySelector<Element>(".react-flow");
}

function viewportFromTransform(transform: string): ExportViewportTransform | null {
  const matrix = transform.match(
    /matrix\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/i
  );
  if (matrix) {
    const a = Number.parseFloat(matrix[1]);
    const b = Number.parseFloat(matrix[2]);
    const x = Number.parseFloat(matrix[5]);
    const y = Number.parseFloat(matrix[6]);
    const zoom = Math.hypot(a, b);
    if ([x, y, zoom].every(Number.isFinite) && zoom > 0) return { x, y, zoom };
  }

  const translated = transform.match(
    /translate(?:3d)?\(\s*(-?[\d.]+)px(?:\s*,|\s+)\s*(-?[\d.]+)px(?:\s*,\s*-?[\d.]+px)?\s*\).*?scale\(\s*([\d.]+)\s*\)/i
  );
  if (!translated) return null;
  const x = Number.parseFloat(translated[1]);
  const y = Number.parseFloat(translated[2]);
  const zoom = Number.parseFloat(translated[3]);
  return [x, y, zoom].every(Number.isFinite) && zoom > 0 ? { x, y, zoom } : null;
}

function viewportFromRoot(root: ParentNode): ExportViewportTransform {
  const viewport = elementsMatching(root, ".react-flow__viewport")[0];
  if (!viewport) return { x: 0, y: 0, zoom: 1 };
  const inline = viewport.getAttribute("style") ?? "";
  const inlineTransform = inline.match(/(?:^|;)\s*transform\s*:\s*([^;]+)/i)?.[1]
    ?? (viewport as HTMLElement).style?.transform
    ?? "";
  return viewportFromTransform(inlineTransform) ?? { x: 0, y: 0, zoom: 1 };
}

function validViewport(viewport: ExportViewportTransform): boolean {
  return (
    Number.isFinite(viewport.x)
    && Number.isFinite(viewport.y)
    && Number.isFinite(viewport.zoom)
    && viewport.zoom > 0
  );
}

/** Converts a rendered client rectangle back into React Flow coordinates. */
export function clientRectToFlowBounds(
  rect: ClientRectLike,
  containerRect: Pick<ClientRectLike, "left" | "top">,
  viewport: ExportViewportTransform
): ExportBounds {
  return {
    x: (rect.left - containerRect.left - viewport.x) / viewport.zoom,
    y: (rect.top - containerRect.top - viewport.y) / viewport.zoom,
    width: rect.width / viewport.zoom,
    height: rect.height / viewport.zoom,
  };
}

function includeClientRect(
  extent: Extent,
  element: Element,
  containerRect: Pick<ClientRectLike, "left" | "top">,
  viewport: ExportViewportTransform
): void {
  const rect = element.getBoundingClientRect();
  includeRect(extent, clientRectToFlowBounds(rect, containerRect, viewport));
}

function dataIdMatches(element: Element, attribute: string, ids: ReadonlySet<string>): boolean {
  const id = element.getAttribute(attribute);
  return id !== null && ids.has(id);
}

function includeNodeDomBounds(
  extent: Extent,
  context: ExportDomBoundsContext,
  nodeIds: ReadonlySet<string>,
  containerRect: Pick<ClientRectLike, "left" | "top">,
  viewport: ExportViewportTransform
): void {
  const nodeElements = elementsMatching(context.root, ".react-flow__node[data-id]")
    .filter((element) => dataIdMatches(element, "data-id", nodeIds));

  for (const element of nodeElements) {
    includeClientRect(extent, element, containerRect, viewport);
    for (const explicitBounds of Array.from(element.querySelectorAll<Element>("[data-export-bounds]"))) {
      if (explicitBounds.closest("[data-export-ignore]")) continue;
      includeClientRect(extent, explicitBounds, containerRect, viewport);
    }
  }
}

type SvgBoundsElement = Element & { getBBox?: () => DOMRect };

function includeSvgBBox(extent: Extent, element: SvgBoundsElement): boolean {
  if (typeof element.getBBox !== "function") return false;
  try {
    const bounds = element.getBBox();
    const rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    includeRect(extent, rect, true);
    return isFiniteRect(rect, true);
  } catch {
    return false;
  }
}

function includeEdgeDomBounds(
  extent: Extent,
  context: ExportDomBoundsContext,
  edgeIds: ReadonlySet<string>,
  containerRect: Pick<ClientRectLike, "left" | "top">,
  viewport: ExportViewportTransform
): void {
  const edgeElements = elementsMatching(context.root, ".react-flow__edge[data-id]")
    .filter((element) => dataIdMatches(element, "data-id", edgeIds));

  for (const edgeElement of edgeElements) {
    const bboxIncluded = includeSvgBBox(extent, edgeElement as SvgBoundsElement);
    if (!bboxIncluded) {
      for (const graphic of Array.from(
        edgeElement.querySelectorAll<Element>("path, text, foreignObject, rect, circle, polygon, polyline")
      )) {
        includeSvgBBox(extent, graphic as SvgBoundsElement);
      }
    }
    // The rendered box also captures marker ink that SVG getBBox may omit.
    includeClientRect(extent, edgeElement, containerRect, viewport);
  }

  const labelElements = elementsMatching(context.root, "[data-export-edge-id]")
    .filter((element) => dataIdMatches(element, "data-export-edge-id", edgeIds));
  for (const labelElement of labelElements) {
    if (labelElement.closest("[data-export-ignore]")) continue;
    includeClientRect(extent, labelElement, containerRect, viewport);
  }
}

function includeDomBounds(
  extent: Extent,
  target: ResolvedExportTarget,
  context: ExportDomBoundsContext
): void {
  const flowContainer = context.flowContainer ?? findFlowContainer(context.root);
  if (!flowContainer) return;
  const viewport = context.viewport ?? viewportFromRoot(context.root);
  if (!validViewport(viewport)) {
    throw new ExportError({
      stage: "resolve-bounds",
      code: "INVALID_BOUNDS",
      message: "The current canvas viewport transform is invalid.",
      diagnostics: { scopeKind: target.scopeKind },
    });
  }

  const containerRect = flowContainer.getBoundingClientRect();
  const nodeIds = new Set(target.nodeIds);
  const edgeIds = new Set(target.edgeIds);
  includeNodeDomBounds(extent, context, nodeIds, containerRect, viewport);
  includeEdgeDomBounds(extent, context, edgeIds, containerRect, viewport);
}

/**
 * Unions model node bounds with live rendered node, edge, and edge-label ink,
 * then applies the requested padding in flow coordinates.
 */
export function computeTightExportBounds(
  target: ResolvedExportTarget,
  options: TightExportBoundsOptions = {}
): ExportBounds {
  const padding = options.padding ?? 24;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new ExportError({
      stage: "resolve-bounds",
      code: "INVALID_BOUNDS",
      message: "Export padding must be a finite number greater than or equal to zero.",
      diagnostics: { scopeKind: target.scopeKind },
    });
  }

  const extent = { ...EMPTY_EXTENT };
  const fromModel = modelBounds(target);
  if (fromModel) includeRect(extent, fromModel);
  if (options.dom) includeDomBounds(extent, target, options.dom);

  const unpadded = extentBounds(extent);
  if (!unpadded) {
    throw new ExportError({
      stage: "resolve-bounds",
      code: "INVALID_BOUNDS",
      message: "The selected content has no measurable export bounds.",
      diagnostics: { scopeKind: target.scopeKind },
    });
  }

  const bounds = {
    x: unpadded.x - padding,
    y: unpadded.y - padding,
    width: unpadded.width + padding * 2,
    height: unpadded.height + padding * 2,
  };
  if (!isFiniteRect(bounds)) {
    throw new ExportError({
      stage: "resolve-bounds",
      code: "INVALID_BOUNDS",
      message: "The selected content produced invalid export bounds.",
      diagnostics: { scopeKind: target.scopeKind, bounds },
    });
  }
  return bounds;
}

export function resolveExportTargetWithBounds<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
>(
  scope: ExportScope,
  nodes: readonly NodeType[],
  edges: readonly EdgeType[],
  options: TightExportBoundsOptions = {}
): ResolvedExportTargetWithBounds<NodeType, EdgeType> {
  const target = resolveExportTarget(scope, nodes, edges);
  return {
    target,
    bounds: computeTightExportBounds(target, options),
  };
}
