import { BOARD_CONTENT_VERSION } from "../config";
import { DEFAULT_BOARD_SETTINGS, type BoardContent } from "../types";
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
  draft: HierarchyDraft
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
  return {
    rootId: draft.roots[0].id,
    content: {
      version: BOARD_CONTENT_VERSION,
      nodes,
      edges,
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
