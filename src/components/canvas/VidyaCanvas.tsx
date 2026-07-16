"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Panel,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  ReactFlowProvider,
  type Connection,
  type Node,
  type Edge,
  type Viewport,
  type OnNodesChange,
  type NodeChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  MarkerType,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Focus, Minus, Plus } from "lucide-react";

import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges/VidyaEdge";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { generateId } from "@/lib/utils";
import { updateBoard } from "@/lib/storage/board-store";
import { AUTOSAVE_DELAY_MS, BOARD_CONTENT_VERSION } from "@/lib/config";
import { DEFAULT_BOARD_SETTINGS, type BoardContent } from "@/lib/types";
import {
  getNodeRect,
  isMatrixHierarchyEdge,
  resolveInsertedNodeCollisions,
  routeForMode,
  synchronizeNodeDimensions,
  type LayoutMode,
} from "@/lib/layout";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import {
  alignmentSnapThreshold,
  snapRectToAlignment,
} from "@/lib/canvas/selection-geometry";
import { useDeviceProfile } from "@/lib/use-device-profile";
import { SelectionToolbar } from "./SelectionToolbar";
import { RelationshipSelectionToolbar } from "./RelationshipSelectionToolbar";
import { RelationshipDiagramDialog } from "./RelationshipDiagramDialog";
import { ExportDialog } from "./ExportDialog";
import { ListTreeConnectors } from "./edges/ListTreeConnectors";
import { StructuredTreeConnectors } from "./edges/StructuredTreeConnectors";
import { renderedGridGap } from "@/lib/canvas/grid-density";
import { plainTextToRichText } from "@/lib/canvas/rich-text-paste";
import { usesManualFlowchartPlacement } from "@/lib/canvas/flowchart-behavior";
import {
  findLogicalConnectorEdgeIds,
  refreshConnectorJunctionHandles,
  releaseConnectorJunctionRouteAnchors,
} from "@/lib/canvas/connector-junction";
import {
  createManojalamClipboardPayload,
  MANOJALAM_NODES_MIME,
  parseManojalamClipboard,
  serializeManojalamClipboard,
  shouldHandleCanvasClipboard,
} from "@/lib/canvas/clipboard";

// ── Alignment guide types ──────────────────────────────────────────────────
interface Guides { h: number[]; v: number[] }

const ALIGNMENT_SNAP_SCREEN_PX = 12;
const CONNECTED_CENTER_SNAP_SCREEN_PX = 18;
const MIN_CANVAS_ZOOM = 0.02;
const MAX_CANVAS_ZOOM = 6;
const MIN_RADIAL_FIT_ZOOM = 0.25;
const MAX_RADIAL_FIT_ZOOM = 1.5;
const LONG_PRESS_PAN_MS = 180;
const LONG_PRESS_CANCEL_DISTANCE = 7;

function initialShapeSize(shapeType: string): { width: number; height: number } {
  if (shapeType === "circle" || shapeType === "diamond" || shapeType === "star" || shapeType === "flower") {
    return { width: 120, height: 120 };
  }
  if (shapeType === "leaf") return { width: 160, height: 96 };
  if (shapeType === "ellipse") return { width: 180, height: 110 };
  if (["document", "database", "predefinedProcess", "delay", "cloud"].includes(shapeType)) {
    return { width: 170, height: 96 };
  }
  return { width: 140, height: 80 };
}

function isNodeLocked(node: Node | undefined): boolean {
  return (node?.data as Record<string, unknown> | undefined)?.locked === true;
}

function applySynchronizedNodeChanges(changes: NodeChange<Node>[], nodes: Node[]): Node[] {
  const nextNodes = applyNodeChanges(changes, nodes);
  const resizedNodes = new Map(
    changes.flatMap((change) =>
      change.type === "dimensions" && change.dimensions
        ? [[change.id, { dimensions: change.dimensions, resizing: change.resizing === true }] as const]
        : []
    )
  );
  if (!resizedNodes.size) return nextNodes;

  return nextNodes.map((node) => {
    const resize = resizedNodes.get(node.id);
    if (!resize) return node;
    const { dimensions } = resize;
    if (node.type === "relationshipDiagram") {
      return synchronizeNodeDimensions(node, dimensions.width, dimensions.height);
    }
    const data = (node.data ?? {}) as Record<string, unknown>;
    const override = data.layoutSizeOverride as { mode?: unknown } | undefined;
    if ((data.userSize || resize.resizing) && override?.mode !== "matrix") {
      return {
        ...node,
        data: {
          ...data,
          ...(resize.resizing ? { autoSizeMode: "fixed" } : {}),
          userSize: { width: dimensions.width, height: dimensions.height },
        },
      };
    }
    return node;
  });
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

function AdaptiveBackground({
  variant,
  baseGap,
  color,
}: {
  variant: BackgroundVariant;
  baseGap: number;
  color: string;
}) {
  const { zoom } = useViewport();
  return (
    <Background
      variant={variant}
      gap={renderedGridGap(baseGap, zoom)}
      size={variant === BackgroundVariant.Dots ? (zoom > 1.8 ? 1.2 : 1.5) : 1}
      color={color}
    />
  );
}

function CanvasZoomControls() {
  const { zoom } = useViewport();
  const { fitView, zoomTo } = useReactFlow();
  const changeZoom = (delta: number) => {
    const next = Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Math.round((zoom + delta) * 10) / 10));
    void zoomTo(next, { duration: 120 });
  };

  return (
    <Panel position="bottom-left" className="canvas-zoom-panel !m-3">
      <div className="canvas-zoom-controls flex items-center overflow-hidden rounded-lg border border-border bg-card shadow-md">
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => changeZoom(-0.1)}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-12 border-x border-border px-1 text-center text-[10px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => changeZoom(0.1)}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Fit board" aria-label="Fit board" className="border-l border-border" onClick={() => void fitView({ padding: 0.2, duration: 300 })}>
          <Focus className="h-3.5 w-3.5" />
        </button>
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function VidyaCanvasInner({ boardId }: { boardId: string }) {
  // Targeted selectors — each only re-renders when its slice changes
  const nodes       = useCanvasStore((s) => s.nodes);
  const edges       = useCanvasStore((s) => s.edges);
  const settings    = useCanvasStore((s) => s.settings);
  const saveStatus  = useCanvasStore((s) => s.saveStatus);
  const hasHydratedBoard = useCanvasStore((s) => s.hasHydratedBoard);
  const hasUserChangedBoard = useCanvasStore((s) => s.hasUserChangedBoard);
  const setNodes    = useCanvasStore((s) => s.setNodes);
  const setEdges    = useCanvasStore((s) => s.setEdges);
  const setStoredViewport = useCanvasStore((s) => s.setViewport);
  const activeTool  = useUIStore((s) => s.activeTool);
  const touchSelectionMode = useUIStore((s) => s.touchSelectionMode);
  const relationshipSelection = useUIStore((s) => s.relationshipSelection);
  const device = useDeviceProfile();
  const isTouchDevice = device.input !== "mouse";

  const { screenToFlowPosition, fitView, zoomTo, getViewport, setViewport: setFlowViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
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
  const lastPointerScreenRef = useRef<{ x: number; y: number } | null>(null);
  const measuredLayoutFramesRef = useRef<number[]>([]);
  const [initialViewport] = useState(() => useCanvasStore.getState().viewport);
  const dragStartRef = useRef<{
    source: { x: number; y: number };
    positions: Map<string, { x: number; y: number }>;
    axis: "x" | "y" | null;
    matrixRootId: string | null;
    moveAsGroup: boolean;
  } | null>(null);

  const zoomByStep = useCallback((delta: number) => {
    const current = getViewport().zoom;
    const next = Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Math.round((current + delta) * 10) / 10));
    void zoomTo(next, { duration: 120 });
  }, [getViewport, zoomTo]);

  const displayNodes = useMemo(() => {
    const matrixAwareNodes = nodes.map((node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const locked = data.locked === true;
      if (data.matrixCell !== true) {
        return locked ? { ...node, draggable: false } : node;
      }
      const matrixRootId = typeof data.matrixRootId === "string" ? data.matrixRootId : null;
      return {
        ...node,
        draggable: !locked && matrixRootId === node.id,
        resizable: false,
      };
    });
    if (!relationshipSelection) return matrixAwareNodes;
    return matrixAwareNodes.map((node) => {
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
        if (
          state.board?.id !== requestedBoardId
          || !state.hasHydratedBoard
          || !state.hasUserChangedBoard
          || state.saveStatus === "saved"
        ) return;

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
    if (saveStatus !== "unsaved" || !hasHydratedBoard) return;
    if (!hasUserChangedBoard) {
      useCanvasStore.setState({ hasUserChangedBoard: true });
    }
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
  }, [saveStatus, hasHydratedBoard, hasUserChangedBoard, enqueueSave]);

  // Measured table/outline layouts wait for React Flow to refresh rendered
  // dimensions before the store performs one atomic placement transaction.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        mode?: LayoutMode;
        rootId?: string;
        nodeIds?: string[];
      }>).detail;
      if ((detail?.mode !== "list" && detail?.mode !== "matrix") || !detail.rootId || !detail.nodeIds?.length) return;

      measuredLayoutFramesRef.current.forEach(cancelAnimationFrame);
      measuredLayoutFramesRef.current = [];
      updateNodeInternals(detail.nodeIds);
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          useCanvasStore.getState().applyLayout(detail.mode!, detail.rootId);
        });
        measuredLayoutFramesRef.current = [second];
      });
      measuredLayoutFramesRef.current = [first];
    };
    window.addEventListener("vidya:apply-measured-layout", handler);
    return () => {
      window.removeEventListener("vidya:apply-measured-layout", handler);
      measuredLayoutFramesRef.current.forEach(cancelAnimationFrame);
      measuredLayoutFramesRef.current = [];
    };
  }, [updateNodeInternals]);

  useEffect(() => {
    const handler = (event: Event) => {
      const nodeIds = (event as CustomEvent<{ nodeIds?: string[] }>).detail?.nodeIds;
      if (nodeIds?.length) updateNodeInternals(nodeIds);
    };
    window.addEventListener("vidya:update-node-internals", handler);
    return () => window.removeEventListener("vidya:update-node-internals", handler);
  }, [updateNodeInternals]);

  // Viewport changes are explicit. Layout application never dispatches this
  // event; only visible Fit/Focus controls do.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        nodeIds?: string[];
        mode?: LayoutMode;
        rootId?: string;
        forceFit?: boolean;
      }>).detail;
      const nodeIds = detail?.nodeIds;
      const targetNodes = nodeIds?.length
        ? useCanvasStore.getState().nodes.filter((node) => nodeIds.includes(node.id) && !node.hidden)
        : undefined;
      const radialFit = detail?.mode === "radial";
      void fitView({
        padding: 0.2,
        duration: 400,
        ...(targetNodes?.length ? { nodes: targetNodes } : {}),
        ...(radialFit ? { minZoom: MIN_RADIAL_FIT_ZOOM, maxZoom: MAX_RADIAL_FIT_ZOOM } : {}),
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
            nodes: applySynchronizedNodeChanges(dimensionChanges, state.nodes),
          }));
        }
        return;
      }
      const lockedIds = new Set(useCanvasStore.getState().nodes
        .filter((node) => isNodeLocked(node))
        .map((node) => node.id));
      const acceptedChanges = changes.filter((change) =>
        change.type !== "position" || !lockedIds.has(change.id)
      );
      if (!acceptedChanges.length) return;
      const isStructural = acceptedChanges.some((c) => c.type === "remove" || c.type === "add");

      if (isStructural) {
        useCanvasStore.getState().pushHistory();
        // Structural changes mark the board dirty via setNodes
        setNodes((nds) => applyNodeChanges(acceptedChanges, nds));
      } else {
        // Dimension / position / select — update nodes WITHOUT touching saveStatus
        useCanvasStore.setState((state) => ({
          nodes: applySynchronizedNodeChanges(acceptedChanges, state.nodes),
        }));
      }

      const stateAfterChanges = useCanvasStore.getState();
      const canReflowMeasuredLayouts = stateAfterChanges.hasUserChangedBoard
        || stateAfterChanges.saveStatus === "unsaved";
      if (canReflowMeasuredLayouts) {
        for (const change of acceptedChanges) {
          if (change.type === "dimensions") {
            stateAfterChanges.scheduleListReflow(change.id);
            stateAfterChanges.scheduleMatrixReflow(change.id);
          }
        }
      }

      // Keep selectedNodeIds in sync (only when selection actually changed)
      if (acceptedChanges.some((c) => c.type === "select")) {
        const state = useCanvasStore.getState();
        useCanvasStore.setState({
          selectedNodeIds: state.nodes.filter((node) => node.selected).map((node) => node.id),
          selectedEdgeIds: state.edges.filter((edge) => edge.selected).map((edge) => edge.id),
        });
      }
    },
    [setNodes]
  );

  const onNodeDragStart = useCallback((_: MouseEvent | TouchEvent, draggedNode: Node) => {
    if (useUIStore.getState().relationshipSelection) return;
    const state = useCanvasStore.getState();
    const storedDraggedNode = state.nodes.find((node) => node.id === draggedNode.id);
    if (isNodeLocked(storedDraggedNode)) return;
    state.pushHistory();
    const draggedData = (draggedNode.data ?? {}) as Record<string, unknown>;
    const matrixRootId = draggedData.matrixCellRole === "header"
      && draggedData.matrixRootId === draggedNode.id
      ? draggedNode.id
      : null;
    const byId = new Map(state.nodes.map((node) => [node.id, node]));
    const selectedGroup = state.selectedNodeIds.length > 1
      && state.selectedNodeIds.includes(draggedNode.id);
    let moveAsGroup = false;
    let movingIds: string[];
    if (matrixRootId) {
      movingIds = state.nodes
        .filter((node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          return node.id === matrixRootId
            || data.matrixRootId === matrixRootId
            || data.matrixFrameFor === matrixRootId;
        })
        .map((node) => node.id);
      moveAsGroup = true;
    } else if (selectedGroup) {
      movingIds = state.selectedNodeIds.filter((nodeId) => !isNodeLocked(byId.get(nodeId)));
    } else {
      const hierarchy = buildHierarchy(state.nodes, state.edges);
      movingIds = [];
      const collectMovableBranch = (nodeId: string) => {
        const node = byId.get(nodeId);
        if (!node || isNodeLocked(node)) return;
        movingIds.push(nodeId);
        for (const childId of hierarchy.get(nodeId)?.childIds ?? []) collectMovableBranch(childId);
      };
      collectMovableBranch(draggedNode.id);
      moveAsGroup = movingIds.length > 1;
    }
    dragStartRef.current = {
      source: { ...draggedNode.position },
      positions: new Map(state.nodes
        .filter((node) => movingIds.includes(node.id))
        .map((node) => [node.id, { ...node.position }])),
      axis: null,
      matrixRootId,
      moveAsGroup,
    };
    const movingJunctionIds = new Set(movingIds.filter((nodeId) => byId.get(nodeId)?.type === "junction"));
    if (movingJunctionIds.size) {
      useCanvasStore.setState((current) => ({
        edges: releaseConnectorJunctionRouteAnchors(current.edges, movingJunctionIds),
      }));
    }
    const preservesWholeLayout = moveAsGroup && typeof draggedData.layoutMode === "string";
    if (!matrixRootId && !preservesWholeLayout) {
      state.markListManualOverride(movingIds, true);
      state.markTreeManualOverride(movingIds, true);
    }
    useUIStore.getState().setCanvasDragging(true);
  }, []);

  // Alignment snapping, guides, and Shift axis-lock — live during drag.
  const onNodeDrag = useCallback((event: MouseEvent | TouchEvent, draggedNode: Node) => {
    const drag = dragStartRef.current;
    let moveX = 0;
    let moveY = 0;
    if (drag) {
      const dx = draggedNode.position.x - drag.source.x;
      const dy = draggedNode.position.y - drag.source.y;
      if (event.shiftKey && !drag.axis && Math.hypot(dx, dy) > 4) {
        drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      moveX = drag.axis === "y" ? 0 : dx;
      moveY = drag.axis === "x" ? 0 : dy;
    }

    const state = useCanvasStore.getState();
    const storedDragged = state.nodes.find((node) => node.id === draggedNode.id) ?? draggedNode;
    const draggedStart = drag?.positions.get(draggedNode.id) ?? draggedNode.position;
    const unsnappedPosition = drag
      ? { x: draggedStart.x + moveX, y: draggedStart.y + moveY }
      : draggedNode.position;
    const movingIds = new Set(drag?.positions.keys() ?? [draggedNode.id]);
    const movingJunctionIds = new Set(Array.from(movingIds).filter((nodeId) => (
      state.nodes.find((node) => node.id === nodeId)?.type === "junction"
    )));
    const draggedRect = getNodeRect({ ...storedDragged, position: unsnappedPosition });
    const alignmentCandidates = state.nodes.filter((node) => {
      if (movingIds.has(node.id) || node.hidden || node.type === "frame") return false;
      if (!drag?.matrixRootId) return true;
      const data = (node.data ?? {}) as Record<string, unknown>;
      return data.matrixRootId !== drag.matrixRootId && data.matrixFrameFor !== drag.matrixRootId;
    });
    const connectedIds = new Set<string>();
    for (const edge of state.edges) {
      if (edge.hidden) continue;
      if (movingIds.has(edge.source) && !movingIds.has(edge.target)) connectedIds.add(edge.target);
      if (movingIds.has(edge.target) && !movingIds.has(edge.source)) connectedIds.add(edge.source);
    }
    const snappingDisabled = event.altKey;
    const zoom = getViewport().zoom;
    const snapOptions = {
      allowX: drag?.axis !== "y",
      allowY: drag?.axis !== "x",
    };
    const generalSnap = snappingDisabled
      ? { dx: 0, dy: 0, horizontalGuides: [], verticalGuides: [] }
      : snapRectToAlignment(
          draggedRect,
          alignmentCandidates.map(getNodeRect),
          {
            ...snapOptions,
            threshold: alignmentSnapThreshold(zoom, ALIGNMENT_SNAP_SCREEN_PX),
          }
        );
    const connectedCenterSnap = snappingDisabled
      ? { dx: 0, dy: 0, horizontalGuides: [], verticalGuides: [] }
      : snapRectToAlignment(
          draggedRect,
          alignmentCandidates.filter((node) => connectedIds.has(node.id)).map(getNodeRect),
          {
            ...snapOptions,
            centersOnly: true,
            threshold: alignmentSnapThreshold(zoom, CONNECTED_CENTER_SNAP_SCREEN_PX, 64),
          }
        );
    const snap = {
      dx: connectedCenterSnap.verticalGuides.length ? connectedCenterSnap.dx : generalSnap.dx,
      dy: connectedCenterSnap.horizontalGuides.length ? connectedCenterSnap.dy : generalSnap.dy,
      verticalGuides: connectedCenterSnap.verticalGuides.length
        ? connectedCenterSnap.verticalGuides
        : generalSnap.verticalGuides,
      horizontalGuides: connectedCenterSnap.horizontalGuides.length
        ? connectedCenterSnap.horizontalGuides
        : generalSnap.horizontalGuides,
    };

    useCanvasStore.setState((current) => {
      const nextNodes = current.nodes.map((node) => {
        const start = drag?.positions.get(node.id);
        if (start) {
          return {
            ...node,
            position: {
              x: start.x + moveX + snap.dx,
              y: start.y + moveY + snap.dy,
            },
          };
        }
        if (!drag && node.id === draggedNode.id) {
          return {
            ...node,
            position: {
              x: unsnappedPosition.x + snap.dx,
              y: unsnappedPosition.y + snap.dy,
            },
          };
        }
        return node;
      });
      return {
        nodes: nextNodes,
        edges: refreshConnectorJunctionHandles(nextNodes, current.edges, movingJunctionIds),
      };
    });
    setGuides({ h: snap.horizontalGuides, v: snap.verticalGuides });
  }, [getViewport]);

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
      if (edgeData.hiddenInMatrix === true) return edge;
      if (edgeData.preserveHandles === true) return edge;
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
        const state = useCanvasStore.getState();
        useCanvasStore.setState({
          selectedNodeIds: state.nodes.filter((node) => node.selected).map((node) => node.id),
          selectedEdgeIds: state.edges.filter((edge) => edge.selected).map((edge) => edge.id),
        });
      }
    },
    [setEdges]
  );

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (useUIStore.getState().relationshipSelection) return;
    event.stopPropagation();
    const clickPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    useUIStore.getState().setConnectorClickPoint({ edgeId: edge.id, ...clickPoint });
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    useCanvasStore.setState((state) => {
      const logicalEdgeIds = findLogicalConnectorEdgeIds(state.edges, edge.id);
      const selectedEdgeIds = new Set(additive ? state.selectedEdgeIds : []);
      const logicalConnectorSelected = logicalEdgeIds.every((edgeId) => selectedEdgeIds.has(edgeId));
      if (additive && logicalConnectorSelected) {
        logicalEdgeIds.forEach((edgeId) => selectedEdgeIds.delete(edgeId));
      } else {
        logicalEdgeIds.forEach((edgeId) => selectedEdgeIds.add(edgeId));
      }
      const selectedNodeIds = additive ? state.selectedNodeIds : [];
      const selectedNodes = new Set(selectedNodeIds);
      return {
        nodes: state.nodes.map((node) => ({ ...node, selected: selectedNodes.has(node.id) })),
        edges: state.edges.map((candidate) => ({ ...candidate, selected: selectedEdgeIds.has(candidate.id) })),
        selectedNodeIds,
        selectedEdgeIds: Array.from(selectedEdgeIds),
      };
    });
  }, [screenToFlowPosition]);

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
      const sourceData = (source?.data ?? {}) as Record<string, unknown>;
      const matrixRoot = typeof sourceData.matrixRootId === "string"
        ? cs.nodes.find((node) => node.id === sourceData.matrixRootId)
        : null;
      const configuredMode = (((matrixRoot?.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode
        ?? sourceData.layoutMode
        ?? "freeForm") as LayoutMode);
      const flowchartEndpoint = source?.type === "shape"
        ? source
        : targetNode?.type === "shape" ? targetNode : null;
      const junctionConnection = source?.type === "junction" || targetNode?.type === "junction";
      const terminatesAtJunction = targetNode?.type === "junction";
      const flowchartConnection = junctionConnection || (!!flowchartEndpoint
        && usesManualFlowchartPlacement(flowchartEndpoint, configuredMode));
      const mode: LayoutMode = flowchartConnection ? "freeForm" : configuredMode;
      const route = source && targetNode ? routeForMode(mode, source, targetNode) : null;
      const hasParent = targetNode && (targetNode.data as { parentId?: string | null }).parentId;
      const recordHierarchy = !!targetNode && !hasParent && !junctionConnection;
      const hiddenInMatrix = mode === "matrix" && !hasParent;
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
        markerEnd: terminatesAtJunction
          ? undefined
          : { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          edgeType: "branch",
          curveStyle: flowchartConnection ? "step" : route?.curveStyle ?? "smooth",
          manualRoute: flowchartConnection,
          preserveHandles: flowchartConnection
            && (!!connection.sourceHandle || !!connection.targetHandle),
          arrowEnd: !terminatesAtJunction,
          hiddenInMatrix,
          hiddenInMatrixFor: hiddenInMatrix ? matrixRoot?.id : undefined,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? connection.source : undefined,
          layoutMode: mode,
        },
      };
      // Record a new hierarchy relation atomically and select the connection so
      // its direct label editor is immediately available.
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          if (recordHierarchy && node.id === connection.target) {
            return { ...node, selected: false, data: { ...data, parentId: connection.source } };
          }
          if (recordHierarchy && node.id === connection.source) {
            const childOrder = Array.isArray(data.childOrder) ? data.childOrder as string[] : [];
            return {
              ...node,
              selected: false,
              data: {
                ...data,
                childOrder: childOrder.includes(connection.target)
                  ? childOrder
                  : [...childOrder, connection.target],
              },
            };
          }
          return node.selected ? { ...node, selected: false } : node;
        }),
        edges: [...state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge), { ...newEdge, selected: true }],
        selectedNodeIds: [],
        selectedEdgeIds: [newEdge.id],
        saveStatus: "unsaved",
      }));
      if (mode === "matrix") requestAnimationFrame(() => cs.scheduleMatrixReflow(connection.source));
    },
    []
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    return !useCanvasStore.getState().edges.some((edge) => (
      edge.source === connection.source && edge.target === connection.target
    ));
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    if (useUIStore.getState().relationshipSelection) return;
    const cs = useCanvasStore.getState();
    const source = cs.nodes.find((n) => n.id === connection.source);
    const target = cs.nodes.find((n) => n.id === connection.target);
    if (!source || !target || source.id === target.id) return;

    cs.pushHistory();
    const currentHierarchy = buildHierarchy(cs.nodes, cs.edges);
    const wasHierarchyEdge = currentHierarchy.get(oldEdge.target)?.parentId === oldEdge.source;
    const sourceData = (source.data ?? {}) as Record<string, unknown>;
    const matrixRoot = typeof sourceData.matrixRootId === "string"
      ? cs.nodes.find((node) => node.id === sourceData.matrixRootId)
      : null;
    const configuredMode = (((matrixRoot?.data as { layoutMode?: LayoutMode } | undefined)?.layoutMode
      ?? sourceData.layoutMode
      ?? "freeForm") as LayoutMode);
    const flowchartEndpoint = source.type === "shape" ? source : target.type === "shape" ? target : null;
    const junctionConnection = source.type === "junction" || target.type === "junction";
    const terminatesAtJunction = target.type === "junction";
    const flowchartConnection = junctionConnection || (!!flowchartEndpoint
      && usesManualFlowchartPlacement(flowchartEndpoint, configuredMode));
    const mode: LayoutMode = flowchartConnection ? "freeForm" : configuredMode;
    const route = routeForMode(mode, source, target);
    // Reconnecting a cross-link must not silently rewrite the canonical tree.
    // Only an edge that was already structural transfers parent metadata.
    const transferHierarchy = wasHierarchyEdge && !junctionConnection;
    const nextNodes = wasHierarchyEdge ? cs.nodes.map((node) => {
      const data = node.data as Record<string, unknown>;
      let nextData = data;
      if (node.id === oldEdge.target && data.parentId === oldEdge.source) {
        nextData = { ...nextData, parentId: null };
      }
      if (node.id === oldEdge.source) {
        nextData = {
          ...nextData,
          childOrder: ((nextData.childOrder as string[] | undefined) ?? []).filter((id) => id !== oldEdge.target),
        };
      }
      if (transferHierarchy && node.id === connection.source) {
        const childOrder = (nextData.childOrder as string[] | undefined) ?? [];
        nextData = {
          ...nextData,
          childOrder: childOrder.includes(connection.target) ? childOrder : [...childOrder, connection.target],
        };
      }
      if (transferHierarchy && node.id === connection.target) {
        nextData = { ...nextData, parentId: connection.source };
      }
      return nextData === data ? node : { ...node, data: nextData };
    }) : cs.nodes;
    const nextHierarchy = buildHierarchy(nextNodes, cs.edges.map((edge) => edge.id === oldEdge.id
      ? { ...edge, source: connection.source, target: connection.target }
      : edge));
    const matrixScope = matrixRoot ? new Set(getSubtree(matrixRoot.id, nextHierarchy)) : null;
    const hierarchyEdge = nextHierarchy.get(connection.target)?.parentId === connection.source;
    const hiddenInMatrix = mode === "matrix"
      && !!matrixScope
      && isMatrixHierarchyEdge(
        { source: connection.source, target: connection.target },
        nextHierarchy,
        matrixScope
      );
    const hiddenInSunburst = mode === "radial" && hierarchyEdge;

    const nextEdges = cs.edges.map((edge) => {
      if (edge.id !== oldEdge.id) return edge;
      const edgeData = (edge.data ?? {}) as Record<string, unknown>;
      const baseHidden = !!edge.hidden
        && edgeData.hiddenInMatrix !== true
        && edgeData.hiddenInSunburst !== true;
      return {
        ...edge,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? route.sourceHandle,
        targetHandle: connection.targetHandle ?? route.targetHandle,
        hidden: baseHidden || hiddenInMatrix || hiddenInSunburst,
        reconnectable: true,
        markerEnd: terminatesAtJunction
          ? undefined
          : edge.markerEnd ?? { type: MarkerType.ArrowClosed, color: "#6366f1" },
        data: {
          ...edgeData,
          waypoints: undefined,
          edgeType: "branch",
          curveStyle: flowchartConnection ? "step" : route.curveStyle,
          manualRoute: flowchartConnection || edgeData.manualRoute === true,
          preserveHandles: flowchartConnection || edgeData.preserveHandles === true,
          arrowEnd: !terminatesAtJunction,
          hiddenInMatrix,
          hiddenInMatrixFor: hiddenInMatrix ? matrixRoot?.id : undefined,
          hiddenInSunburst,
          hiddenInSunburstFor: hiddenInSunburst ? connection.source : undefined,
          layoutMode: mode,
        },
      };
    });

    useCanvasStore.setState({ nodes: nextNodes, edges: nextEdges, saveStatus: "unsaved" });
    requestAnimationFrame(() => {
      cs.scheduleMatrixReflow(oldEdge.source);
      cs.scheduleMatrixReflow(connection.source);
    });
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
            data: { title: "Sanskrit Card", devanagari: "", iast: "", displayMode: "both-stacked", tags: [] },
            style: { width: 320 } };
          break;
        case "shloka":
          newNode = { id, type: "shloka", position,
            data: { title: "Śloka", devanagari: "", iast: "", memorizationStatus: "new", tags: [] },
            style: { width: 360 } };
          break;
        case "grammar":
          newNode = { id, type: "grammar", position,
            data: { topic: "Grammar Rule", category: "sandhi", rule: "", examples: [], tags: ["सन्धिः"] },
            style: { width: 300 } };
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

  const pastePlainTextOnCanvas = useCallback((value: string) => {
    const text = value.replace(/\r\n/g, "\n").trimEnd();
    if (!text.trim()) return;
    const bounds = document.querySelector<HTMLElement>(".vidya-canvas-bg")?.getBoundingClientRect();
    const pointer = lastPointerScreenRef.current;
    const pointerInsideCanvas = !!bounds && !!pointer
      && pointer.x >= bounds.left && pointer.x <= bounds.right
      && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
    const screenPoint = pointerInsideCanvas && pointer
      ? pointer
      : bounds
        ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const flowPoint = screenToFlowPosition(screenPoint);
    const id = generateId();
    const newNode: Node = {
      id,
      type: "text",
      position: { x: flowPoint.x - 140, y: flowPoint.y - 28 },
      data: {
        text,
        richText: plainTextToRichText(text),
        autoSizeMode: "smart",
        scriptMode: "plain",
        tags: [],
      },
      style: { width: 280 },
      selected: true,
    };

    const store = useCanvasStore.getState();
    store.pushHistory();
    useCanvasStore.setState((state) => {
      const candidateNodes = [...state.nodes, newNode];
      const placements = resolveInsertedNodeCollisions(candidateNodes, id);
      return {
        nodes: candidateNodes.map((node) => ({
          ...node,
          selected: node.id === id,
          ...(placements[node.id] ? { position: placements[node.id] } : {}),
        })),
        edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
        selectedNodeIds: [id],
        selectedEdgeIds: [],
        saveStatus: "unsaved",
      };
    });
    toast.success("Pasted text as a new text object.", {
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
  }, [screenToFlowPosition]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (!shouldHandleCanvasClipboard(event.target, document.activeElement)) return;
      const store = useCanvasStore.getState();
      if (!event.clipboardData || !store.selectedNodeIds.length) return;
      const selected = new Set(store.selectedNodeIds);
      const selectedNodes = store.nodes.filter((node) => selected.has(node.id));
      if (!selectedNodes.length) return;
      const selectedEdges = store.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
      const payload = createManojalamClipboardPayload(selectedNodes, selectedEdges);
      try {
        event.clipboardData.setData(MANOJALAM_NODES_MIME, serializeManojalamClipboard(payload));
      } catch {
        // Some mobile browsers reject custom types; plain text still works.
      }
      event.clipboardData.setData("text/plain", selectedNodes.map((node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        return String(data.text ?? data.title ?? data.devanagari ?? "");
      }).filter(Boolean).join("\n"));
      event.preventDefault();
      store.copySelected();
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!shouldHandleCanvasClipboard(event.target, document.activeElement)) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const nodePayload = parseManojalamClipboard(clipboard.getData(MANOJALAM_NODES_MIME));
      if (nodePayload) {
        event.preventDefault();
        event.stopPropagation();
        useCanvasStore.getState().paste(nodePayload);
        toast.success("Pasted copied objects.", {
          action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
        });
        return;
      }

      const plainText = clipboard.getData("text/plain");
      if (!plainText.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      pastePlainTextOnCanvas(plainText);
    };

    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("paste", handlePaste);
    };
  }, [pastePlainTextOnCanvas]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  // CRITICAL FIX: use getState() instead of subscribing to `store`
  // so this effect only runs once (fitView/zoom are stable from useReactFlow)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleCanvasClipboard(e.target, document.activeElement)) return;

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
          zoomByStep(0.1);
        } else if (e.key === "-") {
          e.preventDefault();
          zoomByStep(-0.1);
        } else if (!mod && (e.key === "f" || e.key === "F")) {
          e.preventDefault();
          fitView({ padding: 0.2 });
        }
        return;
      }

      if (mod && e.shiftKey && e.key === "z") { e.preventDefault(); cs.redo(); }
      else if (mod && e.key === "z")           { e.preventDefault(); cs.undo(); }
      else if (mod && e.key === "s")           { e.preventDefault(); cs.setSaveStatus("unsaved"); flushSave(); }
      else if (mod && e.key === "d")           { e.preventDefault(); cs.duplicateSelected(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !mod) { cs.deleteSelected(); }
      else if (e.key === "Tab") {
        const selectedNode = cs.nodes.find((node) => node.id === cs.selectedNodeIds[0]);
        if (selectedNode && !["relationshipDiagram", "sunburst", "frame", "junction"].includes(selectedNode.type ?? "")) {
          e.preventDefault();
          cs.createChildNode(selectedNode.id);
        }
      }
      else if (e.key === "Enter" && !e.shiftKey) {
        const selectedNode = cs.nodes.find((node) => node.id === cs.selectedNodeIds[0]);
        if (selectedNode && !["relationshipDiagram", "sunburst", "frame", "junction"].includes(selectedNode.type ?? "")) {
          e.preventDefault();
          cs.createSiblingNode(selectedNode.id);
        }
      }
      else if (e.key === "f" || e.key === "F") { fitView({ padding: 0.2 }); }
      else if (e.key === "+" || e.key === "=") { zoomByStep(0.1); }
      else if (e.key === "-")                  { zoomByStep(-0.1); }
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
  }, [fitView, flushSave, zoomByStep]);  // No `store` dep — stable!

  const bgVariant =
    settings.background === "grid"  ? BackgroundVariant.Lines :
    settings.background === "dots"  ? BackgroundVariant.Dots  : undefined;
  const gridSpacing = settings.gridSpacing ?? settings.gridSize ?? DEFAULT_BOARD_SETTINGS.gridSpacing ?? 32;
  const canvasBackgroundColor = settings.canvasBackgroundColor ?? "var(--canvas-bg)";
  const gridColor = settings.gridColor ?? "var(--canvas-dot)";

  const clearLongPressPan = useCallback(() => {
    if (longPressPanRef.current) window.clearTimeout(longPressPanRef.current.timeout);
    longPressPanRef.current = null;
  }, []);

  const onPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    lastPointerScreenRef.current = { x: event.clientX, y: event.clientY };
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
    lastPointerScreenRef.current = { x: event.clientX, y: event.clientY };
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
    <>
    <ReactFlow
      data-board-export-root
      nodes={displayNodes}
      edges={displayEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
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
      connectOnClick
      connectionLineStyle={{ stroke: "#4f46e5", strokeWidth: 2 }}
      nodesDraggable={!relationshipSelection}
      nodesConnectable={!relationshipSelection}
      elementsSelectable={!relationshipSelection}
      edgesReconnectable={!relationshipSelection}
      reconnectRadius={isTouchDevice ? 28 : 14}
      minZoom={MIN_CANVAS_ZOOM}
      maxZoom={MAX_CANVAS_ZOOM}
      defaultViewport={initialViewport}
      fitViewOptions={{ padding: 0.2, maxZoom: 2 }}
      snapToGrid={settings.snapToGrid}
      snapGrid={[gridSpacing, gridSpacing]}
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
      connectionRadius={isTouchDevice ? 42 : 28}
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
      style={{ "--board-canvas-bg": canvasBackgroundColor } as React.CSSProperties}
    >
      {bgVariant !== undefined && (
        <AdaptiveBackground variant={bgVariant} baseGap={gridSpacing} color={gridColor} />
      )}
      {activeTool === "connector" && (
        <Panel position="top-center" className="pointer-events-none !mt-3">
          <div className="rounded-full border bg-background/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-md backdrop-blur">
            Click or drag from a blue connection point to another shape
          </div>
        </Panel>
      )}
      <ListTreeConnectors />
      <StructuredTreeConnectors />
      {!relationshipSelection && <SelectionToolbar />}
      <RelationshipSelectionToolbar />
      <AlignmentGuides guides={guides} />
      <CanvasZoomControls />
      <MiniMap nodeColor={(n) => (n.data as { color?: string })?.color ?? "#6366f1"}
        maskColor="rgba(0,0,0,0.06)" position="bottom-right" pannable zoomable />
    </ReactFlow>
    <RelationshipDiagramDialog />
    <ExportDialog />
    </>
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
