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
