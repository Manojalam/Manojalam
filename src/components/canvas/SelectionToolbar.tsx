"use client";

import { useRef, useState } from "react";
import { NodeToolbar, Position, useReactFlow, type Node } from "@xyflow/react";
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
  ChevronDown,
  FileImage,
  FileType2,
  Group,
  Lock,
  Link2,
  Maximize2,
  MessageSquarePlus,
  Move,
  Network,
  Plus,
  Rows3,
  RotateCcw,
  RotateCw,
  Settings2,
  Share2,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { toast } from "sonner";
import {
  alignSelection,
  distributeSelection,
  type SelectionAlignment,
} from "@/lib/canvas/selection-geometry";
import { relationshipDiagramSourceIds } from "@/lib/canvas/chart-selection";
import { isExternalNoteNode } from "@/lib/canvas/node-note";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FLOWCHART_SHAPES } from "@/components/canvas/flowchart-shapes";
import type { ShapeType } from "@/lib/types";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import {
  normalizeObjectRotation,
  resolveObjectRotation,
  supportsObjectRotation,
} from "@/lib/canvas/object-rotation";

function ActionButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-35",
        active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-border" />;
}

function nodeDisplayLabel(node: Node | undefined): string {
  if (!node) return "source removed";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const raw = data.text ?? data.title ?? data.label ?? "canvas object";
  const label = String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label || "canvas object";
}

function ShapeChanger({
  nodeId,
  shapeType,
  cornerRadiusPercent,
  petalCount,
}: {
  nodeId: string;
  shapeType: ShapeType;
  cornerRadiusPercent?: number;
  petalCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const convertNode = useCanvasStore((state) => state.convertNode);
  const currentShape = FLOWCHART_SHAPES.find((shape) => shape.variant === shapeType)
    ?? FLOWCHART_SHAPES[1];

  const changeShape = (nextShape: ShapeType) => {
    if (nextShape !== shapeType) {
      convertNode(nodeId, "shape", {
        shapeType: nextShape,
        borderRadius: undefined,
        ...(nextShape === "rectangle" ? { cornerRadiusPercent: 0 } : {}),
        ...(nextShape === "rounded"
          ? { cornerRadiusPercent: Math.max(40, cornerRadiusPercent ?? 0) }
          : {}),
        ...(nextShape === "flower" ? { petalCount: petalCount ?? 8 } : {}),
      });
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Change shape (currently ${currentShape.label})`}
          aria-label={`Change shape. Current shape: ${currentShape.label}`}
          aria-expanded={open}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {currentShape.icon}
          <ChevronDown className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-export-ignore
        side="top"
        align="start"
        sideOffset={10}
        className="nodrag nopan max-h-[min(60vh,28rem)] w-[18rem] overflow-y-auto p-2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Change shape
        </p>
        <div className="grid grid-cols-4 gap-1" role="listbox" aria-label="Flowchart shapes">
          {FLOWCHART_SHAPES.map((shape) => {
            const active = shape.variant === shapeType;
            return (
              <button
                key={shape.variant}
                type="button"
                role="option"
                aria-selected={active}
                title={shape.label}
                onClick={(event) => {
                  event.stopPropagation();
                  changeShape(shape.variant);
                }}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                )}
              >
                {shape.icon}
                <span className="w-full truncate text-center text-[9px] leading-tight">{shape.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RotationPicker({ nodes }: { nodes: Node[] }) {
  const [open, setOpen] = useState(false);
  const historyCaptured = useRef(false);
  const rotatable = nodes.filter((node) => supportsObjectRotation(
    node.type,
    (node.data ?? {}) as Record<string, unknown>
  ));
  if (!rotatable.length) return null;

  const rotations = rotatable.map((node) => resolveObjectRotation(
    node.type,
    (node.data ?? {}) as Record<string, unknown>
  ));
  const mixed = rotations.some((rotation) => rotation !== rotations[0]);
  const displayedRotation = mixed ? 0 : rotations[0];
  const selectedIds = new Set(rotatable.map((node) => node.id));

  const captureHistory = () => {
    if (historyCaptured.current) return;
    useCanvasStore.getState().pushHistory();
    historyCaptured.current = true;
  };
  const finishChange = () => {
    const changed = historyCaptured.current;
    historyCaptured.current = false;
    if (changed) useCanvasStore.getState().setSaveStatus("unsaved");
  };
  const applyAbsolute = (value: number) => {
    captureHistory();
    const objectRotation = normalizeObjectRotation(value);
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => selectedIds.has(node.id)
        ? { ...node, data: { ...(node.data ?? {}), objectRotation } }
        : node),
      saveStatus: "unsaved",
    }));
  };
  const rotateBy = (delta: number) => {
    historyCaptured.current = false;
    useCanvasStore.getState().pushHistory();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => selectedIds.has(node.id)
        ? {
            ...node,
            data: {
              ...(node.data ?? {}),
              objectRotation: normalizeObjectRotation(resolveObjectRotation(
                node.type,
                (node.data ?? {}) as Record<string, unknown>
              ) + delta),
            },
          }
        : node),
      saveStatus: "unsaved",
    }));
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) finishChange();
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={mixed ? "Rotate selected objects (mixed angles)" : `Rotate object (${displayedRotation}°)`}
          aria-label="Rotate selected objects"
          aria-expanded={open}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            (mixed || displayedRotation !== 0) && "bg-primary/10 text-primary"
          )}
        >
          <RotateCw className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-export-ignore
        side="top"
        align="center"
        sideOffset={10}
        className="nodrag nopan w-72 p-3"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold">Object rotation</p>
            <p className="text-[10px] text-muted-foreground">
              {mixed ? "Mixed angles — moving the slider makes them equal." : `${displayedRotation}°`}
            </p>
          </div>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Angle
            <input
              key={`${rotatable.map((node) => node.id).join("-")}-${mixed ? "mixed" : displayedRotation}`}
              type="number"
              min={-180}
              max={180}
              step={1}
              defaultValue={displayedRotation}
              className="h-7 w-16 rounded-md border border-input bg-background px-2 text-right text-xs text-foreground"
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value) && (mixed || normalizeObjectRotation(value) !== displayedRotation)) {
                  applyAbsolute(value);
                }
                finishChange();
              }}
            />
          </label>
        </div>
        <input
          aria-label="Object rotation angle"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={displayedRotation}
          className="h-1.5 w-full accent-primary"
          onPointerDown={captureHistory}
          onPointerUp={finishChange}
          onPointerCancel={finishChange}
          onKeyDown={(event) => {
            if (!event.repeat) captureHistory();
          }}
          onKeyUp={finishChange}
          onChange={(event) => applyAbsolute(Number(event.currentTarget.value))}
        />
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-border text-xs hover:bg-muted"
            onClick={() => rotateBy(-90)}
          >
            <RotateCcw className="h-3.5 w-3.5" /> 90°
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-border text-xs hover:bg-muted"
            onClick={() => {
              historyCaptured.current = false;
              applyAbsolute(0);
              finishChange();
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-border text-xs hover:bg-muted"
            onClick={() => rotateBy(90)}
          >
            <RotateCw className="h-3.5 w-3.5" /> 90°
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SelectionToolbar() {
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const relationships = useCanvasStore((state) => state.relationships);
  const createChildNode = useCanvasStore((state) => state.createChildNode);
  const createSiblingNode = useCanvasStore((state) => state.createSiblingNode);
  const createNodeNote = useCanvasStore((state) => state.createNodeNote);
  const duplicateSelected = useCanvasStore((state) => state.duplicateSelected);
  const deleteSelected = useCanvasStore((state) => state.deleteSelected);
  const setNodeLocked = useCanvasStore((state) => state.setNodeLocked);
  const setLayoutPanelOpen = useUIStore((state) => state.setLayoutPanelOpen);
  const moveOnlyNodeId = useUIStore((state) => state.moveOnlyNodeId);
  const setMoveOnlyNodeId = useUIStore((state) => state.setMoveOnlyNodeId);
  const openRelationshipDiagram = useUIStore((state) => state.openRelationshipDiagram);
  const openBoardExport = useUIStore((state) => state.openBoardExport);
  const { screenToFlowPosition } = useReactFlow();

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
    const result = distributeSelection(selected, axis);
    if (result.failure === "insufficient-span") {
      toast.error("The outer nodes are too close to distribute without overlap. Move them farther apart first.");
      return;
    }
    if (result.failure) return;
    updateGeometry(result.positions);
    toast.success(`Distributed ${selected.length} nodes ${axis === "x" ? "horizontally" : "vertically"}.`, {
      action: { label: "Undo", onClick: () => useCanvasStore.getState().undo() },
    });
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
  const singleIsSunburst = selected.length === 1 && selected[0].type === "sunburst";
  const singleIsJunction = selected.length === 1 && selected[0].type === "junction";
  const singleIsExternalNote = selected.length === 1 && isExternalNoteNode(selected[0]);
  const noteSourceId = singleIsExternalNote
    ? ((selected[0].data ?? {}) as Record<string, unknown>).noteForNodeId
    : undefined;
  const noteSource = typeof noteSourceId === "string"
    ? nodes.find((node) => node.id === noteSourceId)
    : undefined;
  const noteSourceLabel = nodeDisplayLabel(noteSource);
  const singleLocked = selected.length === 1
    && ((selected[0].data ?? {}) as Record<string, unknown>).locked === true;
  const singleShapeData = selected.length === 1 && selected[0].type === "shape"
    ? ((selected[0].data ?? {}) as Record<string, unknown>)
    : null;
  const singleHasChildren = singleId
    ? (buildHierarchy(nodes, edges).get(singleId)?.childIds.length ?? 0) > 0
    : false;
  const singleCanMoveOnly = singleHasChildren
    && !singleLocked
    && ((selected[0]?.data ?? {}) as Record<string, unknown>).matrixCell !== true;
  const exportTitle = selected.length === 1
    ? String(
        ((selected[0].data ?? {}) as Record<string, unknown>).title
        ?? ((selected[0].data ?? {}) as Record<string, unknown>).text
        ?? "canvas-object"
      )
    : "canvas-selection";
  const relationshipSourceIds = relationshipDiagramSourceIds(
    selected
      .filter((node) => (
        !isExternalNoteNode(node)
        && !["sunburst", "frame", "relationshipDiagram", "junction"].includes(node.type ?? "")
      ))
      .map((node) => node.id),
    relationships
  );

  return (
    <NodeToolbar
      data-export-ignore
      nodeId={selected.map((node) => node.id)}
      isVisible
      position={Position.Top}
      offset={14}
      className="selection-toolbar nodrag nopan flex max-w-[min(94vw,46rem)] flex-wrap items-center justify-center rounded-lg border border-border bg-background/95 p-1 shadow-xl backdrop-blur"
    >
      {singleIsExternalNote && (
        <>
          <div
            role="status"
            title={`Attached to ${noteSourceLabel}`}
            className="flex h-9 max-w-44 items-center gap-1.5 rounded-md bg-muted px-2 text-xs text-muted-foreground"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Attached to {noteSourceLabel}</span>
          </div>
          {typeof noteSourceId === "string" && noteSource && (
            <ActionButton
              label={`Add another note to ${noteSourceLabel}`}
              onClick={(event) => createNodeNote(noteSourceId, screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              }))}
            >
              <MessageSquarePlus className="h-4 w-4" />
            </ActionButton>
          )}
          <Divider />
        </>
      )}

      {singleId && !singleIsRelationshipDiagram && !singleIsSunburst && !singleIsJunction && !singleIsExternalNote && (
        <>
          <ActionButton label="Add child" onClick={() => createChildNode(singleId)}><Plus className="h-4 w-4" /></ActionButton>
          <ActionButton label="Add sibling" onClick={() => createSiblingNode(singleId)}><Rows3 className="h-4 w-4" /></ActionButton>
          <ActionButton
            label="Add note outside box"
            onClick={(event) => createNodeNote(singleId, screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }))}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </ActionButton>
          <ActionButton label="Layout branch" onClick={() => setLayoutPanelOpen(true)}><Network className="h-4 w-4" /></ActionButton>
          {singleCanMoveOnly && (
            <ActionButton
              label={moveOnlyNodeId === singleId
                ? "Move parent only is ready — click to cancel"
                : "Move parent only on the next drag"}
              active={moveOnlyNodeId === singleId}
              onClick={() => {
                const nextNodeId = moveOnlyNodeId === singleId ? null : singleId;
                setMoveOnlyNodeId(nextNodeId);
                if (nextNodeId) {
                  toast.info("Move parent only is ready.", {
                    description: "Drag the parent once; its children and notes will stay in place.",
                  });
                }
              }}
            >
              <Move className="h-4 w-4" />
            </ActionButton>
          )}
          {singleShapeData && (
            <ShapeChanger
              nodeId={singleId}
              shapeType={(singleShapeData.shapeType as ShapeType | undefined) ?? "rounded"}
              cornerRadiusPercent={typeof singleShapeData.cornerRadiusPercent === "number"
                ? singleShapeData.cornerRadiusPercent
                : undefined}
              petalCount={typeof singleShapeData.petalCount === "number" ? singleShapeData.petalCount : undefined}
            />
          )}
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
            label="Change layout and options"
            onClick={() => openRelationshipDiagram({ mode: "edit", diagramNodeId: singleId })}
          >
            <Settings2 className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            label="Fit frame to diagram"
            onClick={() => window.dispatchEvent(new CustomEvent(
              "vidya:fit-relationship-diagram",
              { detail: { nodeId: singleId } }
            ))}
          >
            <Maximize2 className="h-4 w-4" />
          </ActionButton>
          <Divider />
        </>
      )}

      {selected.length > 1 && (
        <>
          <div role="group" aria-label="Align selected objects" className="flex items-center">
            <ActionButton label="Align left edges" onClick={() => align("left")}><AlignStartVertical className="h-4 w-4" /></ActionButton>
            <ActionButton label="Align horizontal centers" onClick={() => align("centerX")}><AlignCenterVertical className="h-4 w-4" /></ActionButton>
            <ActionButton label="Align right edges" onClick={() => align("right")}><AlignEndVertical className="h-4 w-4" /></ActionButton>
            <ActionButton label="Align top edges" onClick={() => align("top")}><AlignStartHorizontal className="h-4 w-4" /></ActionButton>
            <ActionButton label="Align vertical centers" onClick={() => align("centerY")}><AlignCenterHorizontal className="h-4 w-4" /></ActionButton>
            <ActionButton label="Align bottom edges" onClick={() => align("bottom")}><AlignEndHorizontal className="h-4 w-4" /></ActionButton>
          </div>
          <Divider />
          <div role="group" aria-label="Distribute selected objects" className="flex items-center">
            <ActionButton
              label={selected.length < 3 ? "Select at least 3 objects to distribute horizontally" : "Distribute horizontally"}
              disabled={selected.length < 3}
              onClick={() => distribute("x")}
            >
              <AlignVerticalDistributeCenter className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label={selected.length < 3 ? "Select at least 3 objects to distribute vertically" : "Distribute vertically"}
              disabled={selected.length < 3}
              onClick={() => distribute("y")}
            >
              <AlignHorizontalDistributeCenter className="h-4 w-4" />
            </ActionButton>
          </div>
          <Divider />
          <ActionButton label={grouped ? "Ungroup" : "Group"} onClick={toggleGroup}>
            {grouped ? <Ungroup className="h-4 w-4" /> : <Group className="h-4 w-4" />}
          </ActionButton>
          <Divider />
        </>
      )}

      <RotationPicker nodes={selected} />

      {singleId && (
        <ActionButton
          label={singleLocked ? "Unlock object" : "Lock object"}
          onClick={() => setNodeLocked(singleId, !singleLocked)}
        >
          {singleLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </ActionButton>
      )}
      {!singleIsExternalNote && (
        <>
          <ActionButton
            label="Export PNG"
            onClick={() => openBoardExport({
              scope: selected.length === 1 ? "node" : "selection",
              nodeIds: selected.map((node) => node.id),
              format: "png",
              title: exportTitle,
            })}
          >
            <FileImage className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            label="Export SVG"
            onClick={() => openBoardExport({
              scope: selected.length === 1 ? "node" : "selection",
              nodeIds: selected.map((node) => node.id),
              format: "svg",
              title: exportTitle,
            })}
          >
            <FileType2 className="h-4 w-4" />
          </ActionButton>
          <Divider />
        </>
      )}

      <ActionButton
        label={singleIsSunburst ? "Radial charts cannot be duplicated without their source branch" : "Duplicate"}
        disabled={singleIsSunburst}
        onClick={duplicateSelected}
      >
        <Copy className="h-4 w-4" />
      </ActionButton>
      <ActionButton label="Delete" onClick={deleteSelected}><Trash2 className="h-4 w-4 text-destructive" /></ActionButton>
    </NodeToolbar>
  );
}
