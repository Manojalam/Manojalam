"use client";

import { NodeToolbar, Position } from "@xyflow/react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Copy,
  Group,
  Network,
  Plus,
  Rows3,
  Trash2,
  Ungroup,
} from "lucide-react";
import { generateId } from "@/lib/utils";
import { sizeOf } from "@/lib/layout";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

function ActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-border" />;
}

export function SelectionToolbar() {
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const nodes = useCanvasStore((state) => state.nodes);
  const createChildNode = useCanvasStore((state) => state.createChildNode);
  const createSiblingNode = useCanvasStore((state) => state.createSiblingNode);
  const duplicateSelected = useCanvasStore((state) => state.duplicateSelected);
  const deleteSelected = useCanvasStore((state) => state.deleteSelected);
  const setLayoutPanelOpen = useUIStore((state) => state.setLayoutPanelOpen);

  const selected = nodes.filter((node) => selectedNodeIds.includes(node.id) && !node.hidden);
  if (!selected.length) return null;

  const updateGeometry = (nextPositions: Map<string, { x: number; y: number }>) => {
    if (!nextPositions.size) return;
    const store = useCanvasStore.getState();
    store.pushHistory();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => {
        const position = nextPositions.get(node.id);
        return position ? { ...node, position } : node;
      }),
      saveStatus: "unsaved",
    }));
  };

  const align = (mode: AlignMode) => {
    if (selected.length < 2) return;
    const rects = selected.map((node) => {
      const { w, h } = sizeOf(node);
      return { node, w, h, cx: node.position.x + w / 2, cy: node.position.y + h / 2 };
    });
    const left = Math.min(...rects.map((rect) => rect.node.position.x));
    const right = Math.max(...rects.map((rect) => rect.node.position.x + rect.w));
    const top = Math.min(...rects.map((rect) => rect.node.position.y));
    const bottom = Math.max(...rects.map((rect) => rect.node.position.y + rect.h));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const positions = new Map<string, { x: number; y: number }>();
    for (const rect of rects) {
      const position = { ...rect.node.position };
      if (mode === "left") position.x = left;
      if (mode === "centerX") position.x = centerX - rect.w / 2;
      if (mode === "right") position.x = right - rect.w;
      if (mode === "top") position.y = top;
      if (mode === "centerY") position.y = centerY - rect.h / 2;
      if (mode === "bottom") position.y = bottom - rect.h;
      positions.set(rect.node.id, position);
    }
    updateGeometry(positions);
  };

  const distribute = (axis: "x" | "y") => {
    if (selected.length < 3) return;
    const ordered = selected
      .map((node) => ({ node, ...sizeOf(node) }))
      .sort((a, b) => axis === "x" ? a.node.position.x - b.node.position.x : a.node.position.y - b.node.position.y);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const start = axis === "x" ? first.node.position.x : first.node.position.y;
    const end = axis === "x" ? last.node.position.x + last.w : last.node.position.y + last.h;
    const occupied = ordered.reduce((sum, item) => sum + (axis === "x" ? item.w : item.h), 0);
    const gap = Math.max(0, (end - start - occupied) / (ordered.length - 1));
    let cursor = start;
    const positions = new Map<string, { x: number; y: number }>();
    for (const item of ordered) {
      positions.set(item.node.id, {
        x: axis === "x" ? cursor : item.node.position.x,
        y: axis === "y" ? cursor : item.node.position.y,
      });
      cursor += (axis === "x" ? item.w : item.h) + gap;
    }
    updateGeometry(positions);
  };

  const commonGroupId = selected.length > 1
    ? (selected[0].data as Record<string, unknown>).groupId
    : undefined;
  const grouped = typeof commonGroupId === "string" && selected.every(
    (node) => (node.data as Record<string, unknown>).groupId === commonGroupId
  );
  const toggleGroup = () => {
    if (selected.length < 2 && !grouped) return;
    const store = useCanvasStore.getState();
    store.pushHistory();
    const groupId = grouped ? undefined : generateId();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => selectedNodeIds.includes(node.id)
        ? { ...node, data: { ...(node.data ?? {}), groupId } }
        : node),
      saveStatus: "unsaved",
    }));
  };

  const singleId = selected.length === 1 ? selected[0].id : null;

  return (
    <NodeToolbar
      nodeId={selected.map((node) => node.id)}
      isVisible
      position={Position.Top}
      offset={14}
      className="selection-toolbar nodrag nopan flex items-center rounded-lg border border-border bg-background/95 p-1 shadow-xl backdrop-blur"
    >
      {singleId && (
        <>
          <ActionButton label="Add child" onClick={() => createChildNode(singleId)}><Plus className="h-4 w-4" /></ActionButton>
          <ActionButton label="Add sibling" onClick={() => createSiblingNode(singleId)}><Rows3 className="h-4 w-4" /></ActionButton>
          <ActionButton label="Layout branch" onClick={() => setLayoutPanelOpen(true)}><Network className="h-4 w-4" /></ActionButton>
          <Divider />
        </>
      )}

      {selected.length > 1 && (
        <>
          <ActionButton label="Align left" onClick={() => align("left")}><AlignStartVertical className="h-4 w-4" /></ActionButton>
          <ActionButton label="Align horizontal centers" onClick={() => align("centerX")}><AlignCenterVertical className="h-4 w-4" /></ActionButton>
          <ActionButton label="Align right" onClick={() => align("right")}><AlignEndVertical className="h-4 w-4" /></ActionButton>
          <ActionButton label="Align top" onClick={() => align("top")}><AlignStartHorizontal className="h-4 w-4" /></ActionButton>
          <ActionButton label="Align vertical centers" onClick={() => align("centerY")}><AlignCenterHorizontal className="h-4 w-4" /></ActionButton>
          <ActionButton label="Align bottom" onClick={() => align("bottom")}><AlignEndHorizontal className="h-4 w-4" /></ActionButton>
          <ActionButton label="Distribute horizontally" disabled={selected.length < 3} onClick={() => distribute("x")}><AlignVerticalDistributeCenter className="h-4 w-4" /></ActionButton>
          <ActionButton label="Distribute vertically" disabled={selected.length < 3} onClick={() => distribute("y")}><AlignHorizontalDistributeCenter className="h-4 w-4" /></ActionButton>
          <ActionButton label={grouped ? "Ungroup" : "Group"} onClick={toggleGroup}>
            {grouped ? <Ungroup className="h-4 w-4" /> : <Group className="h-4 w-4" />}
          </ActionButton>
          <Divider />
        </>
      )}

      <ActionButton label="Duplicate" onClick={duplicateSelected}><Copy className="h-4 w-4" /></ActionButton>
      <ActionButton label="Delete" onClick={deleteSelected}><Trash2 className="h-4 w-4 text-destructive" /></ActionButton>
    </NodeToolbar>
  );
}
