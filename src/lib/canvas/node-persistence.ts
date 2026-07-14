import type { Node } from "@xyflow/react";

type RuntimeNodeFields = {
  initialWidth?: unknown;
  initialHeight?: unknown;
  resizing?: unknown;
  dragging?: unknown;
};

function positiveDimension(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function storedSize(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const width = positiveDimension(candidate.width);
  const height = positiveDimension(candidate.height);
  return width && height ? { width, height } : null;
}

/**
 * Strip React Flow's render-time geometry before a node crosses a persistence
 * boundary. Authored CSS dimensions stay canonical; explicit dimensions from
 * NodeResizer or legacy boards are promoted only when CSS dimensions are absent.
 */
export function normalizePersistedNode<NodeType extends Node>(node: NodeType): NodeType {
  const runtimeNode = node as NodeType & RuntimeNodeFields;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const style = { ...(node.style ?? {}) };
  const layoutSize = storedSize(data.layoutSizeOverride);
  const userSize = storedSize(data.userSize);
  const authoredUserSize = data.autoSizeMode === "fixed" || data.autoSizeMode === "height-only"
    ? userSize
    : null;

  // A dimensions change with `setAttributes` is a real NodeResizer result and
  // carries width/height alongside measured. Ordinary DOM measurement carries
  // measured only, so it must never freeze an automatic dimension.
  const legacyWidth = positiveDimension(node.width) ?? positiveDimension(runtimeNode.initialWidth);
  const legacyHeight = positiveDimension(node.height) ?? positiveDimension(runtimeNode.initialHeight);

  if (style.width == null) {
    const width = layoutSize?.width ?? authoredUserSize?.width ?? legacyWidth;
    if (width) style.width = width;
  }
  if (style.height == null) {
    const height = layoutSize?.height ?? authoredUserSize?.height ?? legacyHeight;
    if (height) style.height = height;
  }

  const normalized = {
    ...node,
    style,
  } as NodeType & RuntimeNodeFields;

  delete normalized.measured;
  delete normalized.width;
  delete normalized.height;
  delete normalized.initialWidth;
  delete normalized.initialHeight;
  delete normalized.resizing;
  delete normalized.dragging;
  delete normalized.selected;

  return normalized as NodeType;
}

export function normalizePersistedNodes<NodeType extends Node>(nodes: NodeType[]): NodeType[] {
  return nodes.map(normalizePersistedNode);
}
