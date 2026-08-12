import type { Edge, Node } from "@xyflow/react";
import type { CanvasLayer } from "../types";
import { nodeLayer } from "./layer-order";

export type CanvasLayerMove = "forward" | "backward";

function normalizedLayerName(value: unknown, fallbackIndex: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : `Layer ${fallbackIndex + 1}`;
}

/** Accept persisted layer metadata while repairing duplicates and stale order values. */
export function normalizeCanvasLayers(value: unknown): CanvasLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .flatMap((candidate, index) => {
      if (!candidate || typeof candidate !== "object") return [];
      const raw = candidate as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{
        id,
        name: normalizedLayerName(raw.name, index),
        order: typeof raw.order === "number" && Number.isFinite(raw.order)
          ? raw.order
          : index,
        visible: raw.visible !== false,
        locked: raw.locked === true,
        sourceIndex: index,
      }];
    })
    .sort((first, second) => first.order - second.order || first.sourceIndex - second.sourceIndex)
    .map((layer, order) => ({
      id: layer.id,
      name: layer.name,
      order,
      visible: layer.visible,
      locked: layer.locked,
    }));
}

export function nextCanvasLayerName(layers: readonly CanvasLayer[]): string {
  const names = new Set(layers.map((layer) => layer.name.toLocaleLowerCase()));
  let suffix = layers.length + 1;
  while (names.has(`layer ${suffix}`)) suffix += 1;
  return `Layer ${suffix}`;
}

export function canvasItemLayerId(item: Node | Edge): string | null {
  const value = ((item.data ?? {}) as Record<string, unknown>).layerId;
  return typeof value === "string" && value ? value : null;
}

function withLayerId<T extends Node | Edge>(item: T, layerId?: string): T {
  const data = { ...(item.data ?? {}) } as Record<string, unknown>;
  if (layerId) data.layerId = layerId;
  else delete data.layerId;
  return { ...item, data } as T;
}

/** Remove memberships that refer to layers no longer present on the board. */
export function normalizeCanvasLayerMembership(
  nodes: readonly Node[],
  edges: readonly Edge[],
  layers: readonly CanvasLayer[]
): { nodes: Node[]; edges: Edge[] } {
  const validIds = new Set(layers.map((layer) => layer.id));
  const normalize = <T extends Node | Edge>(item: T): T => {
    const layerId = canvasItemLayerId(item);
    return layerId && !validIds.has(layerId) ? withLayerId(item) : item;
  };
  return {
    nodes: nodes.map(normalize),
    edges: edges.map(normalize),
  };
}

export function assignCanvasItemsToLayer(
  nodes: readonly Node[],
  edges: readonly Edge[],
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>,
  layerId?: string
): { nodes: Node[]; edges: Edge[]; changedCount: number } {
  let changedCount = 0;
  const assign = <T extends Node | Edge>(item: T, selected: boolean): T => {
    if (!selected || canvasItemLayerId(item) === (layerId ?? null)) return item;
    changedCount += 1;
    return withLayerId(item, layerId);
  };
  return {
    nodes: nodes.map((node) => assign(node, nodeIds.has(node.id))),
    edges: edges.map((edge) => assign(edge, edgeIds.has(edge.id))),
    changedCount,
  };
}

export function canvasLayerMemberIds(
  nodes: readonly Node[],
  edges: readonly Edge[],
  layerId: string
): { nodeIds: string[]; edgeIds: string[] } {
  return {
    nodeIds: nodes.filter((node) => canvasItemLayerId(node) === layerId).map((node) => node.id),
    edgeIds: edges.filter((edge) => canvasItemLayerId(edge) === layerId).map((edge) => edge.id),
  };
}

export function moveCanvasLayer(
  layers: readonly CanvasLayer[],
  layerId: string,
  direction: CanvasLayerMove
): CanvasLayer[] {
  const normalized = normalizeCanvasLayers(layers);
  const index = normalized.findIndex((layer) => layer.id === layerId);
  const target = direction === "forward" ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= normalized.length) return normalized;
  const reordered = [...normalized];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered.map((layer, order) => ({ ...layer, order }));
}

/** Keep each named layer as a stable stacking block after its order changes. */
export function applyCanvasLayerOrder<T extends Node | Edge>(
  items: readonly T[],
  layers: readonly CanvasLayer[]
): T[] {
  const orderedIds = normalizeCanvasLayers(layers).map((layer) => layer.id);
  const assigned = items
    .map((item, index) => ({ item, index, layerId: canvasItemLayerId(item) }))
    .filter((entry) => entry.layerId && orderedIds.includes(entry.layerId));
  if (!assigned.length) return [...items];

  const start = Math.min(...assigned.map(({ item }) =>
    "source" in item
      ? (typeof item.zIndex === "number" ? item.zIndex : 0)
      : nodeLayer(item as Node)
  ));
  const nextZIndexes = new Map<string, number>();
  let next = start;
  for (const layerId of orderedIds) {
    assigned
      .filter((entry) => entry.layerId === layerId)
      .sort((first, second) => {
        const firstZ = typeof first.item.zIndex === "number" ? first.item.zIndex : 0;
        const secondZ = typeof second.item.zIndex === "number" ? second.item.zIndex : 0;
        return firstZ - secondZ || first.index - second.index;
      })
      .forEach(({ item }) => {
        nextZIndexes.set(item.id, next);
        next += 1;
      });
  }
  return items.map((item) => {
    const zIndex = nextZIndexes.get(item.id);
    return zIndex === undefined ? item : { ...item, zIndex };
  });
}

export function canvasLayerById(
  layers: readonly CanvasLayer[]
): ReadonlyMap<string, CanvasLayer> {
  return new Map(layers.map((layer) => [layer.id, layer]));
}

export function canvasItemLayer(
  item: Node | Edge,
  layersById: ReadonlyMap<string, CanvasLayer>
): CanvasLayer | null {
  const layerId = canvasItemLayerId(item);
  return layerId ? layersById.get(layerId) ?? null : null;
}

export function isCanvasItemLayerVisible(
  item: Node | Edge,
  layersById: ReadonlyMap<string, CanvasLayer>
): boolean {
  return canvasItemLayer(item, layersById)?.visible !== false;
}

export function isCanvasItemLayerLocked(
  item: Node | Edge,
  layersById: ReadonlyMap<string, CanvasLayer>
): boolean {
  return canvasItemLayer(item, layersById)?.locked === true;
}
