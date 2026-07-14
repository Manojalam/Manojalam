"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { FileImage, FileType2, Maximize2, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

import {
  RelationshipDiagramSvg,
  relationshipDiagramDimensions,
} from "@/components/canvas/RelationshipDiagramSvg";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import {
  buildRelationshipGroupsForSpec,
  normalizeRelationshipDiagramSpec,
} from "@/lib/relationship-diagram";
import {
  downloadRelationshipDiagramPng,
  downloadRelationshipDiagramSvg,
} from "@/lib/export";
import { resetNodeDimensions } from "@/lib/layout";
import type { RelationshipDiagramNodeData } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

const FRAME_HEADER_HEIGHT = 44;
const FRAME_CONTENT_PADDING = 16;
const FRAME_MIN_WIDTH = 420;
const FRAME_MIN_HEIGHT = 360;

function HeaderButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="nodrag nopan flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function RelationshipDiagramNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as RelationshipDiagramNodeData;
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const relationships = useCanvasStore((state) => state.relationships);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const setSaveStatus = useCanvasStore((state) => state.setSaveStatus);
  const openRelationshipDiagram = useUIStore((state) => state.openRelationshipDiagram);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [fontMetricsReady, setFontMetricsReady] = useState(false);
  const spec = useMemo(
    () => normalizeRelationshipDiagramSpec(d.relationshipDiagramSpec),
    [d.relationshipDiagramSpec]
  );
  const hierarchy = useMemo(() => buildHierarchy(
    nodes.filter((node) =>
      node.type !== "relationshipDiagram"
      && node.type !== "sunburst"
      && node.type !== "frame"
    ),
    edges
  ), [edges, nodes]);
  const groups = useMemo(
    () => {
      void refreshRevision;
      return buildRelationshipGroupsForSpec({
        spec,
        nodes,
        relationships,
        hierarchy,
      });
    },
    [hierarchy, nodes, refreshRevision, relationships, spec]
  );

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let active = true;
    const refresh = () => {
      if (active) setFontMetricsReady(true);
    };
    void document.fonts.ready.then(refresh);
    document.fonts.addEventListener("loadingdone", refresh);
    return () => {
      active = false;
      document.fonts.removeEventListener("loadingdone", refresh);
    };
  }, []);
  const fitToContent = () => {
    const intrinsic = relationshipDiagramDimensions(groups, spec);
    const width = Math.max(
      FRAME_MIN_WIDTH,
      Math.ceil(intrinsic.width + FRAME_CONTENT_PADDING)
    );
    const height = Math.max(
      FRAME_MIN_HEIGHT,
      Math.ceil(intrinsic.height + FRAME_HEADER_HEIGHT + FRAME_CONTENT_PADDING)
    );
    const store = useCanvasStore.getState();
    store.pushHistory();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => node.id === id
        ? resetNodeDimensions(node, width, height)
        : node),
      saveStatus: "unsaved",
    }));
  };

  const exportSvg = async () => {
    try {
      await downloadRelationshipDiagramSvg(id, spec.title || "relationship-diagram");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the diagram.");
    }
  };
  const exportPng = async () => {
    try {
      await downloadRelationshipDiagramPng(id, spec.title || "relationship-diagram");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the diagram.");
    }
  };

  return (
    <>
      <NodeResizer
        minWidth={FRAME_MIN_WIDTH}
        minHeight={FRAME_MIN_HEIGHT}
        isVisible={selected}
        onResizeStart={() => pushHistory()}
        onResizeEnd={() => setSaveStatus("unsaved")}
      />
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg",
          selected ? "border-primary ring-2 ring-primary/25" : "border-border"
        )}
        style={{ background: spec.background }}
      >
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">
              {spec.title || "Relationship Diagram"}
            </p>
            <p className="truncate text-[9px] capitalize text-muted-foreground">
              {spec.layout.replace(/-/g, " ")} · {groups.length} source{groups.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="nodrag nopan flex shrink-0 items-center gap-1" data-export-ignore>
            <HeaderButton
              title="Refresh from saved relationships"
              onClick={() => {
                setRefreshRevision((revision) => revision + 1);
                fitToContent();
                toast.success("Relationship diagram refreshed and fitted.");
              }}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </HeaderButton>
            <HeaderButton
              title="Change layout and options"
              onClick={() => openRelationshipDiagram({ mode: "edit", diagramNodeId: id })}
            >
              <Settings2 className="h-3 w-3" />
              Layout
            </HeaderButton>
            <HeaderButton title="Fit frame to diagram" onClick={fitToContent}>
              <Maximize2 className="h-3 w-3" />
              Fit
            </HeaderButton>
            <HeaderButton title="Export SVG" onClick={() => void exportSvg()}>
              <FileType2 className="h-3 w-3" />
              SVG
            </HeaderButton>
            <HeaderButton title="Export PNG" onClick={() => void exportPng()}>
              <FileImage className="h-3 w-3" />
              PNG
            </HeaderButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-2">
          <RelationshipDiagramSvg
            groups={groups}
            spec={spec}
            exportId={id}
            measureText={fontMetricsReady}
          />
        </div>
      </div>
    </>
  );
}

export const RelationshipDiagramNode = memo(RelationshipDiagramNodeComponent);
