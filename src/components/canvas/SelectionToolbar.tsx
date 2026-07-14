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
  Share2,
  Trash2,
  Ungroup,
} from "lucide-react";
import { generateId } from "@/lib/utils";
import {
  alignSelection,
  compactEqualSpacing,
  type SelectionAlignment,
} from "@/lib/canvas/selection-geometry";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

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
  const openRelationshipDiagram = useUIStore((state) => state.openRelationshipDiagram);

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

  const align = (mode: SelectionAlignment) => {
    if (selected.length < 2) return;
    updateGeometry(alignSelection(selected, mode));
  };

  const distribute = (axis: "x" | "y") => {
    updateGeometry(compactEqualSpacing(selected, axis));
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
  const singleIsRelationshipDiagram = selected.length === 1 && selected[0].type === "relationshipDiagram";
  const relationshipSourceIds = selected
    .filter((node) => !["sunburst", "frame", "relationshipDiagram"].includes(node.type ?? ""))
    .map((node) => node.id);

  return (
    <NodeToolbar
      data-export-ignore
      nodeId={selected.map((node) => node.id)}
      isVisible
      position={Position.Top}
      offset={14}
      className="selection-toolbar nodrag nopan flex max-w-[min(94vw,46rem)] flex-wrap items-center justify-center rounded-lg border border-border bg-background/95 p-1 shadow-xl backdrop-blur"
    >
      {singleId && !singleIsRelationshipDiagram && (
        <>
          <ActionButton label="Add child" onClick={() => createChildNode(singleId)}><Plus className="h-4 w-4" /></ActionButton>
          <ActionButton label="Add sibling" onClick={() => createSiblingNode(singleId)}><Rows3 className="h-4 w-4" /></ActionButton>
          <ActionButton label="Layout branch" onClick={() => setLayoutPanelOpen(true)}><Network className="h-4 w-4" /></ActionButton>
          <Divider />
        </>
      )}

      {relationshipSourceIds.length > 0 && (
        <>
          <ActionButton
            label="Generate relationship diagram"
            onClick={() => openRelationshipDiagram({ mode: "create", sourceNodeIds: relationshipSourceIds })}
          >
            <Share2 className="h-4 w-4" />
          </ActionButton>
          <Divider />
        </>
      )}

      {singleIsRelationshipDiagram && singleId && (
        <>
          <ActionButton
            label="Relationship diagram options"
            onClick={() => openRelationshipDiagram({ mode: "edit", diagramNodeId: singleId })}
          >
            <Share2 className="h-4 w-4" />
          </ActionButton>
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
          <ActionButton label="Pack with equal horizontal spacing" onClick={() => distribute("x")}><AlignVerticalDistributeCenter className="h-4 w-4" /></ActionButton>
          <ActionButton label="Pack with equal vertical spacing" onClick={() => distribute("y")}><AlignHorizontalDistributeCenter className="h-4 w-4" /></ActionButton>
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
