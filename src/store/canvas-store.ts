"use client";

import { create } from "zustand";
import type { Node, Edge, Viewport } from "@xyflow/react";
import type { BoardSettings, SaveStatus, VidyaBoard } from "@/lib/types";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import { HISTORY_LIMIT } from "@/lib/config";
import { generateId } from "@/lib/utils";

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

interface CanvasState {
  board: VidyaBoard | null;
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  settings: BoardSettings;
  selectedNodeIds: string[];
  saveStatus: SaveStatus;
  history: HistoryEntry[];
  historyIndex: number;
  clipboard: { nodes: Node[]; edges: Edge[] } | null;
  searchQuery: string;
  searchResults: string[];

  setBoard: (board: VidyaBoard) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setViewport: (viewport: Viewport) => void;
  setSettings: (settings: Partial<BoardSettings>) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  copySelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  createChildNode: (parentId: string) => void;
  createSiblingNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  convertNode: (nodeId: string, newType: string, extraData?: Record<string, unknown>) => void;
  updateBoardTitle: (title: string) => void;
  performSearch: (query: string) => void;
}

function cloneState(nodes: Node[], edges: Edge[]): HistoryEntry {
  return { nodes: structuredClone(nodes), edges: structuredClone(edges) };
}

function getNodeText(data: Record<string, unknown>): string {
  const fields = ["text", "title", "topic", "label", "devanagari", "iast", "translation", "rule"];
  return fields.map((f) => data[f]).filter(Boolean).join(" ");
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  board: null,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  settings: { ...DEFAULT_BOARD_SETTINGS },
  selectedNodeIds: [],
  saveStatus: "saved",
  history: [],
  historyIndex: -1,
  clipboard: null,
  searchQuery: "",
  searchResults: [],

  setBoard: (board) =>
    set({
      board,
      nodes: board.content.nodes,
      edges: board.content.edges,
      viewport: board.content.viewport ?? { x: 0, y: 0, zoom: 1 },
      settings: board.content.settings ?? DEFAULT_BOARD_SETTINGS,
      saveStatus: "saved",
      history: [],
      historyIndex: -1,
    }),

  setNodes: (nodesOrFn) =>
    set((state) => ({
      nodes: typeof nodesOrFn === "function" ? nodesOrFn(state.nodes) : nodesOrFn,
      saveStatus: "unsaved",
    })),

  setEdges: (edgesOrFn) =>
    set((state) => ({
      edges: typeof edgesOrFn === "function" ? edgesOrFn(state.edges) : edgesOrFn,
      saveStatus: "unsaved",
    })),

  setViewport: (viewport) => set({ viewport, saveStatus: "unsaved" }),

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
      saveStatus: "unsaved",
    })),

  setSaveStatus: (status) => set({ saveStatus: status }),

  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const entry = cloneState(nodes, edges);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);
    if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const entry = history[newIndex];
    set({
      nodes: structuredClone(entry.nodes),
      edges: structuredClone(entry.edges),
      historyIndex: newIndex,
      saveStatus: "unsaved",
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const entry = history[newIndex];
    set({
      nodes: structuredClone(entry.nodes),
      edges: structuredClone(entry.edges),
      historyIndex: newIndex,
      saveStatus: "unsaved",
    });
  },

  copySelected: () => {
    const { nodes, edges, selectedNodeIds } = get();
    if (!selectedNodeIds.length) return;
    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const selectedEdges = edges.filter(
      (e) => selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target)
    );
    set({ clipboard: { nodes: structuredClone(selectedNodes), edges: structuredClone(selectedEdges) } });
  },

  paste: () => {
    const { clipboard, nodes, edges } = get();
    if (!clipboard) return;
    get().pushHistory();
    const idMap = new Map<string, string>();
    const newNodes = clipboard.nodes.map((n) => {
      const newId = generateId();
      idMap.set(n.id, newId);
      return {
        ...structuredClone(n),
        id: newId,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: true,
      };
    });
    const newEdges = clipboard.edges.map((e) => ({
      ...structuredClone(e),
      id: generateId(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...edges, ...newEdges],
      selectedNodeIds: newNodes.map((n) => n.id),
      saveStatus: "unsaved",
    });
  },

  duplicateSelected: () => {
    get().copySelected();
    get().paste();
  },

  deleteSelected: () => {
    const { selectedNodeIds, nodes, edges } = get();
    if (!selectedNodeIds.length) return;
    get().pushHistory();
    set({
      nodes: nodes.filter((n) => !selectedNodeIds.includes(n.id)),
      edges: edges.filter(
        (e) => !selectedNodeIds.includes(e.source) && !selectedNodeIds.includes(e.target)
      ),
      selectedNodeIds: [],
      saveStatus: "unsaved",
    });
  },

  createChildNode: (parentId) => {
    const { nodes, edges } = get();
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return;
    get().pushHistory();
    const childId = generateId();
    const childCount = edges.filter((e) => e.source === parentId).length;
    const newNode: Node = {
      id: childId,
      type: "mindmap",
      position: {
        x: parent.position.x + 220,
        y: parent.position.y + childCount * 80 - 40,
      },
      data: { text: "New Idea", scriptMode: "plain", color: "#818cf8", tags: [] },
    };
    const newEdge: Edge = {
      id: generateId(),
      source: parentId,
      target: childId,
      type: "branch",
      data: { edgeType: "branch" },
    };
    set({
      nodes: [...nodes, newNode],
      edges: [...edges, newEdge],
      selectedNodeIds: [childId],
      saveStatus: "unsaved",
    });
  },

  createSiblingNode: (nodeId) => {
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const parentEdge = edges.find((e) => e.target === nodeId);
    get().pushHistory();
    const siblingId = generateId();
    const newNode: Node = {
      id: siblingId,
      type: "mindmap",
      position: { x: node.position.x, y: node.position.y + 100 },
      data: { text: "New Idea", scriptMode: "plain", color: "#818cf8", tags: [] },
    };
    const newEdges = [...edges];
    if (parentEdge) {
      newEdges.push({
        id: generateId(),
        source: parentEdge.source,
        target: siblingId,
        type: "branch",
        data: { edgeType: "branch" },
      });
    }
    set({
      nodes: [...nodes, newNode],
      edges: newEdges,
      selectedNodeIds: [siblingId],
      saveStatus: "unsaved",
    });
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
      saveStatus: "unsaved",
    }));
  },

  convertNode: (nodeId, newType, extraData = {}) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    get().pushHistory();

    const newData = { ...node.data, ...extraData };
    if (newType === "shape" && !newData.shapeType) newData.shapeType = "rounded";
    if (newType === "mindmap" && !newData.color)   newData.color = "#818cf8";
    if (newType === "sticky"  && !newData.color)   newData.color = "yellow";

    // Resize to fit text when switching to shapes that need more room
    const curW = (node.measured?.width  ?? (node.style?.width  as number) ?? 180) as number;
    const curH = (node.measured?.height ?? (node.style?.height as number) ?? 80)  as number;
    const shapeType = (newData.shapeType as string) ?? "";
    let newStyle = { ...node.style };
    if (shapeType === "diamond")  { newStyle = { ...newStyle, width: Math.max(curW * 1.5, 180), height: Math.max(curH * 1.5, 120) }; }
    if (shapeType === "circle")   { const s = Math.max(curW, curH, 100); newStyle = { ...newStyle, width: s, height: s }; }
    if (shapeType === "triangle") { newStyle = { ...newStyle, width: Math.max(curW * 1.3, 160), height: Math.max(curH * 1.3, 100) }; }
    // Ensure a minimum size for shapes
    if (newType === "shape" && !newStyle.height) newStyle = { ...newStyle, height: Math.max(curH, 80) };

    set({
      nodes: nodes.map((n) => n.id === nodeId ? { ...n, type: newType, data: newData, style: newStyle } : n),
      saveStatus: "unsaved",
    });
  },

  updateBoardTitle: (title) =>
    set((state) => ({
      board: state.board ? { ...state.board, title } : null,
      saveStatus: "unsaved",
    })),

  performSearch: (query) => {
    const { nodes, edges } = get();
    if (!query.trim()) {
      set({ searchResults: [], searchQuery: query });
      return;
    }
    const q = query.toLowerCase();
    const results: string[] = [];
    for (const node of nodes) {
      const text = getNodeText(node.data as Record<string, unknown>);
      const tags = ((node.data as { tags?: string[] }).tags ?? []).join(" ");
      if (text.toLowerCase().includes(q) || tags.toLowerCase().includes(q)) {
        results.push(node.id);
      }
    }
    for (const edge of edges) {
      const label = String((edge.data as { label?: string })?.label ?? "");
      if (label.toLowerCase().includes(q)) {
        results.push(edge.id);
      }
    }
    set({ searchResults: results, searchQuery: query });
  },
}));
