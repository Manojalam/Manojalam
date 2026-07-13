"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  useViewport,
  ReactFlowProvider,
  type Connection,
  type Node,
  type Edge,
  type Viewport,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  MarkerType,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges/VidyaEdge";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { generateId } from "@/lib/utils";
import { updateBoard } from "@/lib/storage/board-store";
import { AUTOSAVE_DELAY_MS, BOARD_CONTENT_VERSION } from "@/lib/config";
import type { BoardContent } from "@/lib/types";
import { resolveInsertedNodeCollisions, routeForMode, type LayoutMode } from "@/lib/layout";
import { useDeviceProfile } from "@/lib/use-device-profile";
import { SelectionToolbar } from "./SelectionToolbar";
import { RelationshipSelectionToolbar } from "./RelationshipSelectionToolbar";

// ── Alignment guide types ──────────────────────────────────────────────────
interface Guides { h: number[]; v: number[] }

const GUIDE_THRESHOLD = 6; // px in flow coords
const MIN_CANVAS_ZOOM = 0.02;
const MAX_CANVAS_ZOOM = 6;
const LONG_PRESS_PAN_MS = 180;
const LONG_PRESS_CANCEL_DISTANCE = 7;

function initialShapeSize(shapeType: string): { width: number; height: number } {
  if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
    return { width: 120, height: 120 };
  }
  if (shapeType === "leaf") return { width: 160, height: 96 };
  if (["document", "database", "predefinedProcess", "delay", "cloud"].includes(shapeType)) {
    return { width: 170, height: 96 };
  }
  return { width: 140, height: 80 };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToRichText(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map(escapeHtml);
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

function stripRichText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function pasteTextFieldForNode(node: Node): "text" | "devanagari" | "rule" | null {
  if (["shape", "mindmap", "sticky", "text"].includes(node.type ?? "")) return "text";
  if (node.type === "sanskrit" || node.type === "shloka") return "devanagari";
  if (node.type === "grammar") return "rule";
  return null;
}

function calcGuides(
  dragged: { x: number; y: number; w: number; h: number },
  others:  Array<{ x: number; y: number; w: number; h: number }>
): Guides {
  const h: number[] = [];
  const v: number[] = [];
  const { x: dx, y: dy, w: dw, h: dh } = dragged;
  const dL = dx, dR = dx + dw, dCX = dx + dw / 2;
  const dT = dy, dB = dy + dh, dCY = dy + dh / 2;

  for (const o of others) {
    const oL = o.x, oR = o.x + o.w, oCX = o.x + o.w / 2;
    const oT = o.y, oB = o.y + o.h, oCY = o.y + o.h / 2;
    const snap = GUIDE_THRESHOLD;

    if (Math.abs(dL  - oL)  < snap) v.push(oL);
    if (Math.abs(dR  - oR)  < snap) v.push(oR);
    if (Math.abs(dCX - oCX) < snap) v.push(oCX);
    if (Math.abs(dR  - oL)  < snap) v.push(oL);
    if (Math.abs(dL  - oR)  < snap) v.push(oR);

    if (Math.abs(dT  - oT)  < snap) h.push(oT);
    if (Math.abs(dB  - oB)  < snap) h.push(oB);
    if (Math.abs(dCY - oCY) < snap) h.push(oCY);
    if (Math.abs(dB  - oT)  < snap) h.push(oT);
    if (Math.abs(dT  - oB)  < snap) h.push(oB);
  }
  return { h, v };
}

function touchPair(touches: React.TouchList) {
  const first = touches.item(0);
  const second = touches.item(1);
  if (!first || !second) return null;
  const center = {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
  const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  return { center, distance };
}

function shouldSkipLongPressPan(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return Boolean(target.closest([
    "button",
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    ".react-flow__handle",
    ".react-flow__resize-control",
    ".react-flow__edgeupdater",
  ].join(",")));
}

/** Renders guide lines in SCREEN coordinates using the live ReactFlow viewport */
function AlignmentGuides({ guides }: { guides: Guides }) {
  const vp = useViewport();
  if (!guides.h.length && !guides.v.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 9998 }}>
      {guides.h.map((fy, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0"
          style={{ top: fy * vp.zoom + vp.y, height: 1, background: "#ef4444", opacity: 0.85 }} />
      ))}
      {guides.v.map((fx, i) => (
        <div key={`v${i}`} className="absolute top-0 bottom-0"
          style={{ left: fx * vp.zoom + vp.x, width: 1, background: "#ef4444", opacity: 0.85 }} />
      ))}
    </div>
  );
}

function AdaptiveBackground({ variant, baseGap }: { variant: BackgroundVariant; baseGap: number }) {
  const { zoom } = useViewport();
  const density = zoom < 0.22 ? 2.5 : zoom < 0.55 ? 1.6 : zoom > 2.4 ? 0.75 : 1;
  return (
    <Background
      variant={variant}
      gap={Math.round(baseGap * density)}
      size={variant === BackgroundVariant.Dots ? (zoom > 1.8 ? 1.2 : 1.5) : 1}
      color="var(--canvas-dot)"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function VidyaCanvasInner({ boardId }: { boardId: string }) {
  // Targeted selectors — each only re-renders when its slice changes
  const nodes       = useCanvasStore((s) => s.nodes);
  const edges       = useCanvasStore((s) => s.edges);
  const settings    = useCanvasStore((s) => s.settings);
  const saveStatus  = useCanvasStore((s) => s.saveStatus);
  const setNodes    = useCanvasStore((s) => s.setNodes);
  const setEdges    = useCanvasStore((s) => s.setEdges);
  const setStoredViewport = useCanvasStore((s) => s.setViewport);
  const setSelectedNodeIds = useCanvasStore((s) => s.setSelectedNodeIds);
  const setSelectedEdgeIds = useCanvasStore((s) => s.setSelectedEdgeIds);
  const activeTool  = useUIStore((s) => s.activeTool);
  const touchSelectionMode = useUIStore((s) => s.touchSelectionMode);
  const relationshipSelection = useUIStore((s) => s.relationshipSelection);
  const device = useDeviceProfile();
  const isTouchDevice = device.input !== "mouse";

  const { screenToFlowPosition, fitView, zoomIn, zoomOut, getViewport, setViewport: setFlowViewport } = useReactFlow();
  const [spacePressed, setSpacePressed] = useState(false);
  const [guides, setGuides] = useState<Guides>({ h: [], v: [] });
  const pinchRef = useRef<{
    distance: number;
    flowCenter: { x: number; y: number };
    startZoom: number;
  } | null>(null);
  const longPressPanRef = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    startViewport: Viewport;
    lastViewport: Viewport;
    active: boolean;
    timeout: number;
  } | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const dragStartRef = useRef<{
    source: { x: number; y: number };
    positions: Map<string, { x: number; y: number }>;
    axis: "x" | "y" | null;
  } | null>(null);

  const displayNodes = useMemo(() => {
    if (!relationshipSelection) return nodes;
    return nodes.map((node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const isActiveChart = node.type === "sunburst" && data.rootId === relationshipSelection.chartRootNodeId;
      if (isActiveChart || node.hidden) return node;
      return {
        ...node,
        style: {
          ...(node.style ?? {}),
          opacity: 0.2,
          pointerEvents: "none" as const,
        },
      };
    });
  }, [nodes, relationshipSelection]);

  const displayEdges = useMemo(() => {
    if (!relationshipSelection) return edges;
    return edges.map((edge) => ({
      ...edge,
      animated: false,
      style: { ...(edge.style ?? {}), opacity: 0.12 },
    }));
  }, [edges, relationshipSelection]);

  // Serialize saves so an edit made during an in-flight request cannot be
  // overwritten by an older response. Every queued job verifies its board id
  // before reading the global store, which also prevents cross-board writes.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimerRef = useRef<number | null>(null);
  const enqueueSave = useCallback(() => {
    const requestedBoardId = boardId;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const state = useCanvasStore.getState();
        if (state.board?.id !== requestedBoardId || state.saveStatus === "saved") return;

        const title = state.board.title;
        const content = {
          version: BOARD_CONTENT_VERSION,
          nodes: state.nodes,
          edges: state.edges,
          relationships: state.relationships,
          relationshipFans: state.relationshipFans,
          viewport: state.viewport,
          settings: state.settings,
        } as BoardContent;
        state.setSaveStatus("saving");

        try {
          await updateBoard(requestedBoardId, { title, content });
          const current = useCanvasStore.getState();
          if (current.board?.id === requestedBoardId && current.saveStatus === "saving") {
            current.setSaveStatus("saved");
          }
        } catch {
          const current = useCanvasStore.getState();
          if (current.board?.id === requestedBoardId && current.saveStatus !== "unsaved") {
            current.setSaveStatus("error");
          }
        }
      });
  }, [boardId]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    enqueueSave();
  }, [enqueueSave]);

  useEffect(() => {
    if (saveStatus !== "unsaved") return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      enqueueSave();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [saveStatus, enqueueSave]);

  // Fit the view after an auto-layout is applied (dispatched from LayoutPanel).
  useEffect(() => {
    const handler = (event: Event) => {
      const nodeIds = (event as CustomEvent<{ nodeIds?: string[] }>).detail?.nodeIds;
      const targetNodes = nodeIds?.length
        ? useCanvasStore.getState().nodes.filter((node) => nodeIds.includes(node.id))
        : undefined;
      void fitView({
        padding: 0.2,
        duration: 400,
        ...(targetNodes?.length ? { nodes: targetNodes } : {}),
      });
    };
    window.addEventListener("vidya:fitview", handler);
    return () => window.removeEventListener("vidya:fitview", handler);
  }, [fitView]);

  // ── onNodesChange ──────────────────────────────────────────────────
  // KEY DESIGN:
  // - "dimensions" and "select" changes come from React Flow internally on
  //   every render/layout pass. They must NOT set saveStatus:"unsaved" or
  //   they trigger an endless re-render cascade that crashes Chrome.
  // - "position" (dragging) also fires many times per second — same rule.
  // - Only "add" / "remove" are real user edits that mark the board dirty.
  // - Drag-end history is pushed by onNodeDragStop (fires once on mouse-up).
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (useUIStore.getState().relationshipSelection) {
        const dimensionChanges = changes.filter((change) => change.type === "dimensions");
        if (dimensionChanges.length) {
          useCanvasStore.setState((state) => ({
            nodes: applyNodeChanges(dimensionChanges, state.nodes),
          }));
        }
        return;
      }
      const isStructural = changes.some((c) => c.type === "remove" || c.type === "add");

      if (isStructural) {
        useCanvasStore.getState().pushHistory();
        // Structural changes mark the board dirty via setNodes
        setNodes((nds) => applyNodeChanges(changes, nds));
      } else {
        // Dimension / position / select — update nodes WITHOUT touching saveStatus
        useCanvasStore.setState((state) => ({
          nodes: applyNodeChanges(changes, state.nodes),
        }));
      }

      // Keep selectedNodeIds in sync (only when selection actually changed)
      if (changes.some((c) => c.type === "select")) {
        const nodes = useCanvasStore.getState().nodes;
        setSelectedNodeIds(nodes.filter((n) => n.selected).map((n) => n.id));
        setSelectedEdgeIds([]);
      }
    },
    [setNodes, setSelectedNodeIds, setSelectedEdgeIds]
  );

  const onNodeDragStart = useCallback((_: MouseEvent | TouchEvent, draggedNode: Node) => {
    if (useUIStore.getState().relationshipSelection) return;
    const state = useCanvasStore.getState();
    state.pushHistory();
    const movingIds = state.selectedNodeIds.includes(draggedNode.id)
      ? state.selectedNodeIds
      : [draggedNode.id];
    dragStartRef.current = {
      source: { ...draggedNode.position },
      positions: new Map(state.nodes
        .filter((node) => movingIds.includes(node.id))
        .map((node) => [node.id, { ...node.position }])),
      axis: null,
    };
    useUIStore.getState().setCanvasDragging(true);
  }, []);

  // Alignment guides and Shift axis-lock — live during drag.
  const onNodeDrag = useCallback((event: MouseEvent | TouchEvent, draggedNode: Node) => {
    const drag = dragStartRef.current;
    if (drag && event.shiftKey) {
      const dx = draggedNode.position.x - drag.source.x;
      const dy = draggedNode.position.y - drag.source.y;
      if (!drag.axis && Math.hypot(dx, dy) > 4) drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (drag.axis) {
        useCanvasStore.setState((state) => ({
          nodes: state.nodes.map((node) => {
            const start = drag.positions.get(node.id);
            if (!start) return node;
            return {
              ...node,
              position: {
                x: start.x + (drag.axis === "x" ? dx : 0),
                y: start.y + (drag.axis === "y" ? dy : 0),
              },
            };
          }),
        }));
      }
    }

    const allNodes = useCanvasStore.getState().nodes;
    const dw = (draggedNode.measured?.width  ?? 150) as number;
    const dh = (draggedNode.measured?.height ?? 60)  as number;
    const dragged = { x: draggedNode.position.x, y: draggedNode.position.y, w: dw, h: dh };
    const others  = allNodes
      .filter((n) => n.id !== draggedNode.id)
      .map((n) => ({
        x: n.position.x,
        y: n.position.y,
        w: (n.measured?.width  ?? 150) as number,
        h: (n.measured?.height ?? 60)  as number,
      }));
    setGuides(calcGuides(dragged, others));
  }, []);

  // Push history when a drag ends (safe: fires once, not on every frame)
  const onNodeDragStop = useCallback(() => {
    if (useUIStore.getState().relationshipSelection) return;
    setGuides({ h: [], v: [] });
    const movedIds = new Set(dragStartRef.current?.positions.keys() ?? []);
    const state = useCanvasStore.getState();
    const byId = new Map(state.nodes.map((node) => [node.id, node]));
    const reroutedEdges = state.edges.map((edge) => {
      if (!movedIds.has(edge.source) && !movedIds.has(edge.target)) return edge;
      const sourceNode = byId.get(edge.source);
      const targetNode = byId.get(edge.target);
      if (!sourceNode || !targetNode) return edge;
      const edgeData = (edge.data ?? {}) as Record<string, unknown>;
      const mode = ((edgeData.layoutMode ?? (sourceNode.data as Record<string, unknown>).layoutMode ?? "freeForm") as LayoutMode);
      const route = routeForMode(mode, sourceNode, targetNode);
      return { ...edge, sourceHandle: route.sourceHandle, targetHandle: route.targetHandle };
    });
    useCanvasStore.setState({ edges: reroutedEdges });
    dragStartRef.current = null;
    useUIStore.getState().setCanvasDragging(false);
    state.setSaveStatus("unsaved");
  }, []);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (useUIStore.getState().relationshipSelection) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const groupId = (node.data as Record<string, unknown> | undefined)?.groupId;
    if (typeof groupId !== "string" || event.metaKey || event.ctrlKey || event.shiftKey) return;
    useCanvasStore.setState((state) => {
      const groupIds = state.nodes
        .filter((candidate) => (candidate.data as Record<string, unknown> | undefined)?.groupId === groupId)
        .map((candidate) => candidate.id);
      if (groupIds.length < 2) return {};
      const selected = new Set(groupIds);
      return {
        nodes: state.nodes.map((candidate) => ({ ...candidate, selected: selected.has(candidate.id) })),
        edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
        selectedNodeIds: groupIds,
        selectedEdgeIds: [],
      };
    });
  }, []);

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (useUIStore.getState().relationshipSelection) return;
      const isStructural = changes.some((c) => c.type === "remove" || c.type === "add");
      if (isStructural) {
        useCanvasStore.getState().pushHistory();
        setEdges((eds) => applyEdgeChanges(changes, eds));
      } else {
        useCanvasStore.setState((state) => ({
          edges: applyEdgeChanges(changes, state.edges),
        }));
      }

      if (changes.some((c) => c.type === "select")) {
        const edges = useCanvasStore.getState().edges;
        setSelectedEdgeIds(edges.filter((e) => e.selected).map((e) => e.id));
        setSelectedNodeIds([]);
      }
    },
    [setEdges, setSelectedEdgeIds, setSelectedNodeIds]
  );

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (useUIStore.getState().relationshipSelection) return;
    event.stopPropagation();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      edges: state.edges.map((candidate) => ({ ...candidate, selected: candidate.id === edge.id })),
      selectedNodeIds: [],
      selectedEdgeIds: [edge.id],
    }));
  }, []);

  const onConnect = useCallback(
    (connection: {
      source: string; target: string;
      sourceHandle?: string | null; targetHandle?: string | null;
    }) => {
      if (useUIStore.getState().relationshipSelection) return;
      const cs = useCanvasStore.getState();
      cs.pushHistory();
      const source = cs.nodes.find((n) => n.id === connection.source);
      const targetNode = cs.nodes.find((n) => n.id === connection.target);
      const mode = ((source?.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode ?? "freeForm") as LayoutMode;
      const route = source && targetNode ? routeForMode(mode, source, targetNode) : null;
      const hiddenInMatrix = mode === "matrix";
      const hiddenInSunburst = mode === "radial";
      const newEdge: Edge = {
        id: generateId(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? route?.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? route?.targetHandle ?? undefined,
        type: "branch",
        hidden: hiddenInMatrix || hiddenInSunburst,
        reconnectable: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          edgeType: "branch",
          curveStyle: route?.curveStyle ?? "smooth",
          hiddenInMatrix,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? connection.source : undefined,
          layoutMode: mode,
        },
      };
      // Record parent→child relationship if the target has no parent yet.
      const hasParent = targetNode && (targetNode.data as { parentId?: string | null }).parentId;
      if (targetNode && !hasParent) {
        cs.updateNodeData(connection.target, { parentId: connection.source });
      }
      setEdges((eds) => [...eds, newEdge]);
    },
    [setEdges]
  );

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    if (useUIStore.getState().relationshipSelection) return;
    const cs = useCanvasStore.getState();
    const source = cs.nodes.find((n) => n.id === connection.source);
    const target = cs.nodes.find((n) => n.id === connection.target);
    if (!source || !target || source.id === target.id) return;

    cs.pushHistory();
    const mode = ((source.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode ?? "freeForm") as LayoutMode;
    const route = routeForMode(mode, source, target);
    const hiddenInMatrix = mode === "matrix";
    const hiddenInSunburst = mode === "radial";

    const nextEdges = cs.edges.map((edge) => {
      if (edge.id !== oldEdge.id) return edge;
      return {
        ...edge,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? route.sourceHandle,
        targetHandle: connection.targetHandle ?? route.targetHandle,
        hidden: hiddenInMatrix || hiddenInSunburst,
        reconnectable: true,
        markerEnd: edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          ...(edge.data ?? {}),
          edgeType: "branch",
          curveStyle: route.curveStyle,
          hiddenInMatrix,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? connection.source : undefined,
          layoutMode: mode,
        },
      };
    });

    const nextNodes = cs.nodes.map((node) => {
      const data = node.data as Record<string, unknown>;
      if (node.id === oldEdge.target && oldEdge.target !== connection.target) {
        return { ...node, data: { ...data, parentId: null } };
      }
      if (node.id === oldEdge.source || node.id === connection.source) {
        const withoutOldTarget = ((data.childOrder as string[] | undefined) ?? []).filter((id) => id !== oldEdge.target);
        if (node.id !== connection.source) return { ...node, data: { ...data, childOrder: withoutOldTarget } };
        return {
          ...node,
          data: {
            ...data,
            childOrder: withoutOldTarget.includes(connection.target) ? withoutOldTarget : [...withoutOldTarget, connection.target],
          },
        };
      }
      if (node.id === connection.target) {
        return { ...node, data: { ...data, parentId: connection.source } };
      }
      return node;
    });

    useCanvasStore.setState({ nodes: nextNodes, edges: nextEdges, saveStatus: "unsaved" });
  }, []);

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (useUIStore.getState().relationshipSelection) return;
      const tool = useUIStore.getState().activeTool;
      if (tool === "select" || tool === "pan") {
        useCanvasStore.setState((state) => ({
          edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
          selectedEdgeIds: [],
        }));
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      useCanvasStore.getState().pushHistory();

      let newNode: Node | null = null;
      const id = generateId();

      switch (tool) {
        case "mindmap":
          newNode = { id, type: "shape", position,
            data: { shapeType: "rounded", text: "New Idea", scriptMode: "plain", color: "#818cf8", tags: [] },
            style: { width: 180 } };
          break;
        case "sticky":
          newNode = { id, type: "sticky", position,
            data: { text: "", color: "yellow", tags: [] },
            style: { width: 180 } };
          break;
        case "text":
          newNode = { id, type: "text", position,
            data: { text: "", scriptMode: "plain", tags: [] },
            style: { width: 240 } };
          break;
        case "shape": {
          const sv = useUIStore.getState().shapeVariant ?? "rounded";
          const size = initialShapeSize(sv);
          newNode = { id, type: "shape", position,
            data: { shapeType: sv, text: "", color: "#4262ff", tags: [], ...(sv === "flower" && { petalCount: 8 }) },
            style: size };
          break;
        }
        case "frame":
          newNode = { id, type: "frame", position,
            data: { title: "Frame", color: "#6366f1", background: "#6366f108", tags: [] },
            style: { width: 400, height: 300 }, zIndex: -1 };
          break;
        case "sanskrit":
          newNode = { id, type: "sanskrit", position,
            data: { title: "Sanskrit Card", devanagari: "", iast: "", displayMode: "both-stacked", tags: [] } };
          break;
        case "shloka":
          newNode = { id, type: "shloka", position,
            data: { title: "Śloka", devanagari: "", iast: "", memorizationStatus: "new", tags: [] } };
          break;
        case "grammar":
          newNode = { id, type: "grammar", position,
            data: { topic: "Grammar Rule", category: "sandhi", rule: "", examples: [], tags: ["सन्धिः"] } };
          break;
      }

      if (newNode) {
        setNodes((nds) => {
          const next = [...nds, newNode!];
          const placements = resolveInsertedNodeCollisions(next, newNode!.id);
          return next.map((n) => placements[n.id] ? { ...n, position: placements[n.id] } : n);
        });
        useUIStore.getState().setActiveTool("select");
      }
    },
    [screenToFlowPosition, setNodes]  // stable deps
  );

  const pasteClipboard = useCallback(async () => {
    const cs = useCanvasStore.getState();
    if (cs.clipboard) {
      cs.paste();
      toast.success("Pasted copied objects.", {
        action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
      });
      return;
    }

    if (cs.selectedNodeIds.length !== 1) {
      toast.error("Select one editable node before pasting text.");
      return;
    }

    const node = cs.nodes.find((candidate) => candidate.id === cs.selectedNodeIds[0]);
    if (!node) return;
    const targetField = pasteTextFieldForNode(node);
    if (!targetField) {
      toast.error("Select a text, shape, sticky, mind-map, or Sanskrit node to paste text.");
      return;
    }

    try {
      const pasted = await navigator.clipboard?.readText();
      if (!pasted?.trim()) return;
      const data = (node.data ?? {}) as Record<string, unknown>;
      const existing = targetField === "text"
        ? (stripRichText(data.richText) || (typeof data.text === "string" ? data.text : ""))
        : (typeof data[targetField] === "string" ? data[targetField] : "");
      const nextText = existing ? `${existing}\n${pasted}` : pasted;
      cs.pushHistory();
      cs.updateNodeData(node.id, {
        [targetField]: nextText,
        ...(targetField === "text" ? { richText: plainTextToRichText(nextText) } : {}),
      });
      toast.success("Pasted text into selected node.", {
        action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
      });
    } catch {
      toast.error("Open the node editor to paste text, or allow clipboard access.");
    }
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  // CRITICAL FIX: use getState() instead of subscribing to `store`
  // so this effect only runs once (fitView/zoom are stable from useReactFlow)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.code === "Space") { setSpacePressed(true); e.preventDefault(); return; }

      const mod = e.metaKey || e.ctrlKey;
      const cs  = useCanvasStore.getState();
      const ui  = useUIStore.getState();

      if (ui.relationshipSelection) {
        if (e.key === "Escape") {
          e.preventDefault();
          useUIStore.setState({ relationshipSelection: null });
        } else if (e.key === "Enter") {
          e.preventDefault();
          window.dispatchEvent(new Event("vidya:commit-relationships"));
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          zoomOut();
        } else if (!mod && (e.key === "f" || e.key === "F")) {
          e.preventDefault();
          fitView({ padding: 0.2 });
        }
        return;
      }

      if (mod && e.shiftKey && e.key === "z") { e.preventDefault(); cs.redo(); }
      else if (mod && e.key === "z")           { e.preventDefault(); cs.undo(); }
      else if (mod && e.key === "s")           { e.preventDefault(); cs.setSaveStatus("unsaved"); flushSave(); }
      else if (mod && e.key === "c")           { cs.copySelected(); }
      else if (mod && e.key === "v")           { e.preventDefault(); void pasteClipboard(); }
      else if (mod && e.key === "d")           { e.preventDefault(); cs.duplicateSelected(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !mod) { cs.deleteSelected(); }
      else if (e.key === "Tab")                { e.preventDefault(); if (cs.selectedNodeIds[0]) cs.createChildNode(cs.selectedNodeIds[0]); }
      else if (e.key === "Enter" && !e.shiftKey) {
        if (cs.selectedNodeIds[0]) { e.preventDefault(); cs.createSiblingNode(cs.selectedNodeIds[0]); }
      }
      else if (e.key === "f" || e.key === "F") { fitView({ padding: 0.2 }); }
      else if (e.key === "+" || e.key === "=") { zoomIn(); }
      else if (e.key === "-")                  { zoomOut(); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && cs.selectedNodeIds.length) {
        e.preventDefault();
        if (!e.repeat) cs.pushHistory();
        const amount = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -amount : e.key === "ArrowRight" ? amount : 0;
        const dy = e.key === "ArrowUp" ? -amount : e.key === "ArrowDown" ? amount : 0;
        const selected = new Set(cs.selectedNodeIds);
        useCanvasStore.setState((state) => ({
          nodes: state.nodes.map((node) => selected.has(node.id)
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
            : node),
          saveStatus: "unsaved",
        }));
      }
      else if (!mod && !e.shiftKey && e.key.length === 1) {
        const shortcuts: Record<string, string> = { v:"select", h:"pan", m:"mindmap", s:"sticky", t:"text", c:"connector", r:"shape" };
        const t = shortcuts[e.key.toLowerCase()];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (t) ui.setActiveTool(t as any);
      }

      if (mod && e.key === "k") { e.preventDefault(); ui.setCommandPaletteOpen(true); }
      if (mod && e.key === "f" && !e.shiftKey) { e.preventDefault(); ui.setSearchPanelOpen(true); }
    };

    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") setSpacePressed(false); };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [fitView, zoomIn, zoomOut, flushSave, pasteClipboard]);  // No `store` dep — stable!

  const bgVariant =
    settings.background === "grid"  ? BackgroundVariant.Lines :
    settings.background === "dots"  ? BackgroundVariant.Dots  : undefined;

  const clearLongPressPan = useCallback(() => {
    if (longPressPanRef.current) window.clearTimeout(longPressPanRef.current.timeout);
    longPressPanRef.current = null;
  }, []);

  const onPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isTouchDevice || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;
    if (touchSelectionMode) return;
    if (!event.isPrimary || activeTool === "connector" || useUIStore.getState().drawingModeNodeId) return;
    if (shouldSkipLongPressPan(event.target)) return;

    clearLongPressPan();
    const start = { x: event.clientX, y: event.clientY };
    const viewport = getViewport();
    const pointerId = event.pointerId;
    const timeout = window.setTimeout(() => {
      const current = longPressPanRef.current;
      if (current?.pointerId === pointerId) current.active = true;
    }, LONG_PRESS_PAN_MS);

    longPressPanRef.current = {
      pointerId,
      start,
      startViewport: viewport,
      lastViewport: viewport,
      active: false,
      timeout,
    };
  }, [activeTool, clearLongPressPan, getViewport, isTouchDevice, touchSelectionMode]);

  const onPointerMoveCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = longPressPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const dx = event.clientX - pan.start.x;
    const dy = event.clientY - pan.start.y;
    if (!pan.active) {
      if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_DISTANCE) clearLongPressPan();
      return;
    }

    const nextViewport = {
      x: pan.startViewport.x + dx,
      y: pan.startViewport.y + dy,
      zoom: pan.startViewport.zoom,
    };
    pan.lastViewport = nextViewport;
    suppressNextContextMenuRef.current = true;
    void setFlowViewport(nextViewport, { duration: 0 });
    event.preventDefault();
    event.stopPropagation();
  }, [clearLongPressPan, setFlowViewport]);

  const onPointerEndCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = longPressPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (pan.active) setStoredViewport(pan.lastViewport);
    clearLongPressPan();
  }, [clearLongPressPan, setStoredViewport]);

  const onContextMenuCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextContextMenuRef.current) return;
    suppressNextContextMenuRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onTouchStartCapture = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isTouchDevice || event.touches.length !== 2) return;
    clearLongPressPan();
    const pair = touchPair(event.touches);
    if (!pair || pair.distance <= 0) return;
    const viewport = getViewport();
    pinchRef.current = {
      distance: pair.distance,
      flowCenter: screenToFlowPosition(pair.center),
      startZoom: viewport.zoom,
    };
    event.preventDefault();
    event.stopPropagation();
  }, [clearLongPressPan, getViewport, isTouchDevice, screenToFlowPosition]);

  const onTouchMoveCapture = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!isTouchDevice || !pinch || event.touches.length !== 2) return;
    const pair = touchPair(event.touches);
    if (!pair || pair.distance <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localCenter = {
      x: pair.center.x - bounds.left,
      y: pair.center.y - bounds.top,
    };
    const zoom = Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, pinch.startZoom * (pair.distance / pinch.distance)));
    void setFlowViewport({
      x: localCenter.x - pinch.flowCenter.x * zoom,
      y: localCenter.y - pinch.flowCenter.y * zoom,
      zoom,
    }, { duration: 0 });
    event.preventDefault();
    event.stopPropagation();
  }, [isTouchDevice, setFlowViewport]);

  const onTouchEndCapture = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!pinchRef.current || event.touches.length >= 2) return;
    pinchRef.current = null;
    setStoredViewport(getViewport());
  }, [getViewport, setStoredViewport]);

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onReconnect={onReconnect}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      onNodeClick={onNodeClick}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={!relationshipSelection}
      nodesConnectable={!relationshipSelection}
      elementsSelectable={!relationshipSelection}
      edgesReconnectable={!relationshipSelection}
      reconnectRadius={isTouchDevice ? 28 : 14}
      minZoom={MIN_CANVAS_ZOOM}
      maxZoom={MAX_CANVAS_ZOOM}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 2 }}
      snapToGrid={settings.snapToGrid}
      snapGrid={[settings.gridSize ?? 20, settings.gridSize ?? 20]}
      panOnDrag={relationshipSelection
        ? [0, 1, 2]
        : isTouchDevice
          ? !touchSelectionMode
          : activeTool === "pan" || spacePressed ? [0, 1, 2] : [1, 2]}
      selectionOnDrag={!relationshipSelection && (touchSelectionMode || (!isTouchDevice && activeTool === "select"))}
      selectionMode={SelectionMode.Partial}
      multiSelectionKeyCode={["Meta", "Control", "Shift"]}
      panOnScroll
      zoomOnScroll
      zoomOnPinch
      noPanClassName={isTouchDevice ? "rf-no-pan" : "nopan"}
      preventScrolling
      nodeClickDistance={isTouchDevice ? 8 : 0}
      paneClickDistance={isTouchDevice ? 8 : 0}
      nodeDragThreshold={isTouchDevice ? 6 : 1}
      connectionRadius={isTouchDevice ? 42 : 20}
      deleteKeyCode={null}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerEndCapture}
      onPointerCancelCapture={onPointerEndCapture}
      onContextMenuCapture={onContextMenuCapture}
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
      onTouchCancelCapture={onTouchEndCapture}
      defaultEdgeOptions={{
        type: "branch",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
      }}
      onMoveEnd={(_, viewport) => setStoredViewport(viewport)}
      className="vidya-canvas-bg"
    >
      {bgVariant !== undefined && (
        <AdaptiveBackground variant={bgVariant} baseGap={settings.gridSize ?? 24} />
      )}
      {!relationshipSelection && <SelectionToolbar />}
      <RelationshipSelectionToolbar />
      <AlignmentGuides guides={guides} />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap nodeColor={(n) => (n.data as { color?: string })?.color ?? "#6366f1"}
        maskColor="rgba(0,0,0,0.06)" position="bottom-right" pannable zoomable />
    </ReactFlow>
  );
}

export function VidyaCanvas({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      <div className="h-full w-full">
        <VidyaCanvasInner boardId={boardId} />
      </div>
    </ReactFlowProvider>
  );
}
