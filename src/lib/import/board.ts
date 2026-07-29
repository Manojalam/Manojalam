import type { Edge, Node } from "@xyflow/react";
import { BOARD_CONTENT_VERSION } from "../config";
import {
  DEFAULT_BOARD_SETTINGS,
  type BoardContent,
  type ShapeType,
} from "../types";
import { generateId } from "../utils";
import { fontFamilyForScript, scriptModeForText } from "./script";
import type { HierarchyDraft, HierarchyDraftNode } from "./types";

const DEPTH_COLORS = [
  "#4f46e5",
  "#6366f1",
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#0f766e",
];

export interface ImportedBoardContent {
  content: BoardContent;
  rootId: string;
}

export interface ImportedHierarchyInsertion {
  nodes: BoardContent["nodes"];
  edges: BoardContent["edges"];
  rootId: string;
  nodeIds: string[];
}

export type HierarchyBoardPresentation = "hierarchy" | "cards";

export interface HierarchyBoardContentOptions {
  presentation?: HierarchyBoardPresentation;
  cardShapeType?: ShapeType;
}

export const IMPORT_CARD_COLUMNS = 3;
export const IMPORT_CARD_WIDTH = 360;
export const IMPORT_CARD_COLUMN_GAP = 48;
export const IMPORT_CARD_ROW_GAP = 28;

function escapeRichText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function richCardText(label: string, notes: string): string {
  const heading = `<p><strong>${escapeRichText(label)}</strong></p>`;
  if (!notes.trim()) return heading;
  const details = escapeRichText(notes).replace(/\r?\n/g, "<br>");
  return `${heading}<p>${details}</p>`;
}

function estimatedCardHeight(text: string): number {
  const lineCount = text.split(/\r?\n/).reduce((total, line) => (
    total + Math.max(1, Math.ceil(Array.from(line.trim()).length / 34))
  ), 0);
  return Math.max(104, Math.min(340, 48 + lineCount * 25));
}

function arrangeImportedCards(
  nodes: BoardContent["nodes"],
  rootId: string,
  shapeType: ShapeType
): BoardContent["nodes"] {
  const root = nodes.find((node) => node.id === rootId);
  if (!root) return nodes;
  const cards = nodes.filter((node) => node.id !== rootId);
  const columns = Math.max(
    1,
    Math.min(IMPORT_CARD_COLUMNS, Math.ceil(Math.sqrt(Math.max(1, cards.length))))
  );
  const gridLeft = 120;
  const gridWidth = columns * IMPORT_CARD_WIDTH
    + Math.max(0, columns - 1) * IMPORT_CARD_COLUMN_GAP;
  const titleWidth = Math.min(520, Math.max(300, Array.from(String(root.data.text ?? "")).length * 16));
  const arranged = new Map<string, BoardContent["nodes"][number]>();

  arranged.set(rootId, {
    ...root,
    type: "text",
    position: {
      x: gridLeft + (gridWidth - titleWidth) / 2,
      y: 90,
    },
    data: {
      ...root.data,
      importCardHierarchy: true,
      autoSizeMode: "fixed",
      userSize: { width: titleWidth, height: 72 },
      fontSize: 26,
      fontWeight: "bold",
      textAlign: "center",
      textColor: root.data.color,
    },
    style: { width: titleWidth, height: 72 },
  });

  let top = 210;
  for (let start = 0; start < cards.length; start += columns) {
    const row = cards.slice(start, start + columns);
    const rowWidth = row.length * IMPORT_CARD_WIDTH
      + Math.max(0, row.length - 1) * IMPORT_CARD_COLUMN_GAP;
    let left = gridLeft + (gridWidth - rowWidth) / 2;
    const rowHeights = row.map((node) => {
      const text = [
        String(node.data.label ?? node.data.text ?? "").trim(),
        String(node.data.notes ?? "").trim(),
      ].filter(Boolean).join("\n");
      return estimatedCardHeight(text);
    });
    const rowHeight = Math.max(...rowHeights);

    row.forEach((node, index) => {
      const label = String(node.data.label ?? node.data.text ?? "").trim();
      const notes = String(node.data.notes ?? "").trim();
      const text = [label, notes].filter(Boolean).join("\n\n");
      const height = rowHeights[index];
      arranged.set(node.id, {
        ...node,
        type: "shape",
        position: { x: left, y: top },
        data: {
          ...node.data,
          text,
          richText: richCardText(label, notes),
          shapeType,
          cornerRadiusPercent: shapeType === "rounded" ? 40 : 0,
          borderColor: node.data.color,
          borderWidth: 2.5,
          fillOpacity: 0.08,
          textAlign: "center",
          textVerticalAlign: "middle",
          fontSize: 16,
          fontWeight: "normal",
          importCardHierarchy: true,
          autoSizeMode: "fixed",
          userSize: { width: IMPORT_CARD_WIDTH, height },
        },
        style: { width: IMPORT_CARD_WIDTH, height },
      });
      left += IMPORT_CARD_WIDTH + IMPORT_CARD_COLUMN_GAP;
    });
    top += rowHeight + IMPORT_CARD_ROW_GAP;
  }

  return nodes.map((node) => arranged.get(node.id) ?? node);
}

/**
 * Cards intentionally have no connectors on the canvas. When the user later
 * converts those cards to a connected hierarchy layout, recreate only the
 * missing parent-child edges from the preserved hierarchy metadata.
 */
export function restoreImportedCardHierarchyEdges(
  nodes: Node[],
  edges: Edge[],
  scopeNodeIds: ReadonlySet<string>,
  createId: () => string = generateId
): Edge[] {
  const scopeNodes = nodes.filter((node) => scopeNodeIds.has(node.id));
  if (!scopeNodes.some((node) => node.data.importCardHierarchy === true)) return edges;

  const existingRelations = new Set(
    edges.map((edge) => `${edge.source}\u0000${edge.target}`)
  );
  const usedIds = new Set([
    ...nodes.map((node) => node.id),
    ...edges.map((edge) => edge.id),
  ]);
  const additions: Edge[] = [];

  for (const node of scopeNodes) {
    if (node.data.importCardHierarchy !== true) continue;
    const parentId = typeof node.data.parentId === "string"
      ? node.data.parentId
      : null;
    if (!parentId || !scopeNodeIds.has(parentId)) continue;
    const relation = `${parentId}\u0000${node.id}`;
    if (existingRelations.has(relation)) continue;
    existingRelations.add(relation);
    additions.push({
      id: allocateInsertionId(usedIds, createId),
      source: parentId,
      target: node.id,
      type: "branch",
      data: {
        edgeType: "branch",
        arrowEnd: true,
      },
    });
  }

  return additions.length ? [...edges, ...additions] : edges;
}

function allocateInsertionId(
  usedIds: Set<string>,
  createId: () => string
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = createId();
    if (!candidate || usedIds.has(candidate)) continue;
    usedIds.add(candidate);
    return candidate;
  }
  throw new Error("Could not allocate unique IDs for the imported hierarchy.");
}

/**
 * Current-board imports are independent hierarchy roots. Always remap their
 * IDs, even when a collision is unlikely, so repeated imports remain isolated
 * and cannot overwrite an existing node or connector.
 */
export function remapHierarchyForBoardInsertion(
  content: Pick<BoardContent, "nodes" | "edges">,
  sourceRootId: string,
  reservedIds: Iterable<string> = [],
  createId: () => string = generateId
): ImportedHierarchyInsertion {
  if (!content.nodes.some((node) => node.id === sourceRootId)) {
    throw new Error("The imported hierarchy root is missing.");
  }

  const usedIds = new Set(reservedIds);
  const nodeIdMap = new Map(
    content.nodes.map((node) => [
      node.id,
      allocateInsertionId(usedIds, createId),
    ])
  );
  const nodes: BoardContent["nodes"] = content.nodes.map((node) => {
    const data = structuredClone((node.data ?? {}) as Record<string, unknown>);
    const parentId = typeof data.parentId === "string"
      ? nodeIdMap.get(data.parentId) ?? null
      : null;
    const childOrder = Array.isArray(data.childOrder)
      ? data.childOrder.flatMap((childId) =>
          typeof childId === "string" && nodeIdMap.has(childId)
            ? [nodeIdMap.get(childId)!]
            : []
        )
      : [];
    return {
      ...structuredClone(node),
      id: nodeIdMap.get(node.id)!,
      data: {
        ...data,
        parentId,
        childOrder,
      } as typeof node.data,
      selected: false,
    };
  });
  const edges: BoardContent["edges"] = content.edges.map((edge) => {
    const source = nodeIdMap.get(edge.source);
    const target = nodeIdMap.get(edge.target);
    if (!source || !target) {
      throw new Error("The imported hierarchy contains an invalid connector.");
    }
    return {
      ...structuredClone(edge),
      id: allocateInsertionId(usedIds, createId),
      source,
      target,
      selected: false,
    };
  });

  return {
    nodes,
    edges,
    rootId: nodeIdMap.get(sourceRootId)!,
    nodeIds: nodes.map((node) => node.id),
  };
}

export function hierarchyDraftToBoardContent(
  draft: HierarchyDraft,
  options: HierarchyBoardContentOptions = {}
): ImportedBoardContent {
  if (draft.roots.length !== 1) {
    throw new Error("The hierarchy must have exactly one root before importing.");
  }
  const nodes: BoardContent["nodes"] = [];
  const edges: BoardContent["edges"] = [];
  let row = 0;

  const addNode = (
    node: HierarchyDraftNode,
    parentId: string | null,
    depth: number
  ): void => {
    const scriptMode = scriptModeForText(`${node.label}\n${node.notes}`);
    const childOrder = node.children.map((child) => child.id);
    nodes.push({
      id: node.id,
      type: "mindmap",
      position: {
        x: 120 + depth * 250,
        y: 100 + row * 96,
      },
      data: {
        label: node.label,
        text: node.label,
        notes: node.notes || undefined,
        scriptMode,
        fontFamily: fontFamilyForScript(scriptMode),
        fontSize: depth === 0 ? 18 : 15,
        fontWeight: depth <= 1 ? "bold" : "normal",
        color: DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)],
        tags: [],
        parentId,
        childOrder,
        autoSizeMode: "smart",
      },
      style: {
        width: depth === 0 ? 240 : 210,
        minHeight: 64,
      },
    });
    row += 1;

    for (const child of node.children) {
      edges.push({
        id: generateId(),
        source: node.id,
        target: child.id,
        type: "branch",
        data: {
          edgeType: "branch",
          arrowEnd: true,
        },
      });
      addNode(child, node.id, depth + 1);
    }
  };

  addNode(draft.roots[0], null, 0);
  const cardPresentation = options.presentation === "cards";
  const outputNodes = cardPresentation
    ? arrangeImportedCards(nodes, draft.roots[0].id, options.cardShapeType ?? "rounded")
    : nodes;
  return {
    rootId: draft.roots[0].id,
    content: {
      version: BOARD_CONTENT_VERSION,
      nodes: outputNodes,
      edges: cardPresentation ? [] : edges,
      relationships: [],
      relationshipFans: [],
      viewport: { x: 0, y: 0, zoom: 0.8 },
      settings: {
        ...DEFAULT_BOARD_SETTINGS,
        defaultScriptMode: draft.roots[0].scriptMode,
      },
    },
  };
}
