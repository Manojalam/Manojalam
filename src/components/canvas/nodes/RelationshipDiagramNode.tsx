"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Move } from "lucide-react";

import {
  RelationshipDiagramSvg,
  relationshipDiagramDimensions,
} from "@/components/canvas/RelationshipDiagramSvg";
import { MediaAttachmentPreviewStrip } from "@/components/canvas/NodeMediaLayer";
import {
  CHART_NODE_MAX_SIZE,
  RELATIONSHIP_DIAGRAM_MIN_HEIGHT,
  RELATIONSHIP_DIAGRAM_MIN_WIDTH,
} from "@/lib/canvas/chart-sizing";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import {
  buildRelationshipGroupsForSpec,
  normalizeRelationshipDiagramSpec,
} from "@/lib/relationship-diagram";
import type { RelationshipDiagramNodeData } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import {
  chartHierarchyEdgeToken,
  chartNodeContentToken,
} from "@/lib/canvas/chart-render-data";
import { relationshipDiagramItemMediaAttachments } from "@/lib/relationship-diagram-item-media";

interface RelationshipItemMediaPlacement {
  itemId: string;
  left: number;
  top: number;
  attachments: ReturnType<typeof relationshipDiagramItemMediaAttachments>;
}

const MemoizedRelationshipDiagramSvg = memo(RelationshipDiagramSvg);

function RelationshipDiagramNodeComponent({ id, data, selected }: NodeProps) {
  const nodeContentToken = useCanvasStore((state) => chartNodeContentToken(state.nodes));
  const hierarchyEdgeToken = useCanvasStore((state) => chartHierarchyEdgeToken(state.edges));
  const canvasDragging = useUIStore((state) => state.canvasDragging);
  const { nodes, edges } = useMemo(() => {
    // These tokens intentionally gate when the latest store snapshot is read.
    void canvasDragging;
    void hierarchyEdgeToken;
    void nodeContentToken;
    const state = useCanvasStore.getState();
    return { nodes: state.nodes, edges: state.edges };
  }, [canvasDragging, hierarchyEdgeToken, nodeContentToken]);
  const d = (nodes.find((node) => node.id === id)?.data ?? data) as RelationshipDiagramNodeData;
  const relationships = useCanvasStore((state) => state.relationships);
  const showLabelBoxGuides = useCanvasStore(
    (state) => state.settings.showLabelBoxGuides === true
  );
  const beginManualNodeResize = useCanvasStore((state) => state.beginManualNodeResize);
  const finishManualNodeResize = useCanvasStore((state) => state.finishManualNodeResize);
  const setNodeSize = useCanvasStore((state) => state.setNodeSize);
  const itemSelection = useUIStore((state) => state.relationshipDiagramItemSelection);
  const setItemSelection = useUIStore((state) => state.setRelationshipDiagramItemSelection);
  const [fontMetricsReady, setFontMetricsReady] = useState(false);
  const [mediaPlacements, setMediaPlacements] = useState<RelationshipItemMediaPlacement[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const spec = useMemo(
    () => normalizeRelationshipDiagramSpec(d.relationshipDiagramSpec),
    [d.relationshipDiagramSpec]
  );
  const hierarchy = useMemo(() => buildHierarchy(
    nodes.filter((node) =>
      node.type !== "relationshipDiagram"
      && node.type !== "junction"
      && node.type !== "sunburst"
      && node.type !== "frame"
    ),
    edges
  ), [edges, nodes]);
  const groups = useMemo(
    () => buildRelationshipGroupsForSpec({
      spec,
      nodes,
      relationships,
      hierarchy,
    }),
    [hierarchy, nodes, relationships, spec]
  );
  const selectedItemId = itemSelection?.diagramNodeId === id
    && groups.some((group) => group.itemId === itemSelection.itemId)
    ? itemSelection.itemId
    : undefined;

  const selectItem = useCallback((itemId: string) => {
    const selectedIds = new Set([id]);
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) })),
      edges: state.edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
      selectedNodeIds: [id],
      selectedEdgeIds: [],
    }));
    setItemSelection({ diagramNodeId: id, itemId });
  }, [id, setItemSelection]);

  useEffect(() => {
    if (
      itemSelection?.diagramNodeId === id
      && (!selected || !groups.some((group) => group.itemId === itemSelection.itemId))
    ) {
      setItemSelection(null);
    }
  }, [groups, id, itemSelection, selected, setItemSelection]);

  const refreshMediaPlacements = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const intrinsic = relationshipDiagramDimensions(groups, spec);
    const scale = Math.min(
      content.clientWidth / Math.max(1, intrinsic.width),
      content.clientHeight / Math.max(1, intrinsic.height)
    );
    if (!Number.isFinite(scale) || scale <= 0) return;
    const offsetX = (content.clientWidth - intrinsic.width * scale) / 2;
    const offsetY = (content.clientHeight - intrinsic.height * scale) / 2;
    const placements: RelationshipItemMediaPlacement[] = [];
    const anchors = new Map(
      Array.from(content.querySelectorAll<SVGGElement>(
        '[data-relationship-diagram-item-anchor="true"]'
      )).map((anchor) => [anchor.dataset.relationshipDiagramItemId, anchor])
    );

    for (const group of groups) {
      const attachments = relationshipDiagramItemMediaAttachments(spec.itemStyles, group.itemId);
      if (!attachments.length) continue;
      const anchor = anchors.get(group.itemId);
      if (!anchor) continue;
      const bounds = anchor.getBBox();
      placements.push({
        itemId: group.itemId,
        left: offsetX + (bounds.x + bounds.width) * scale - 4,
        top: offsetY + (bounds.y + bounds.height) * scale - 4,
        attachments,
      });
    }
    setMediaPlacements(placements);
  }, [groups, spec]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const frame = window.requestAnimationFrame(refreshMediaPlacements);
    const observer = new ResizeObserver(refreshMediaPlacements);
    observer.observe(content);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fontMetricsReady, refreshMediaPlacements]);

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

  const fitToContent = useCallback(() => {
    const intrinsic = relationshipDiagramDimensions(groups, spec);
    const width = Math.max(RELATIONSHIP_DIAGRAM_MIN_WIDTH, Math.ceil(intrinsic.width));
    const height = Math.max(RELATIONSHIP_DIAGRAM_MIN_HEIGHT, Math.ceil(intrinsic.height));
    setNodeSize(id, { width, height });
  }, [groups, id, setNodeSize, spec]);

  useEffect(() => {
    const handleFitRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === id) fitToContent();
    };
    window.addEventListener("vidya:fit-relationship-diagram", handleFitRequest);
    return () => window.removeEventListener("vidya:fit-relationship-diagram", handleFitRequest);
  }, [fitToContent, id]);

  return (
    <>
      <div
        className={d.locked === true
          ? "relative h-full w-full cursor-default overflow-visible"
          : "relative h-full w-full cursor-move overflow-visible"}
        style={{
          background: spec.background || "transparent",
          ...objectRotationStyle("relationshipDiagram", d as Record<string, unknown>),
        }}
        aria-label={spec.title || "Relationship diagram"}
        onPointerDown={() => {
          if (itemSelection?.diagramNodeId === id) setItemSelection(null);
        }}
      >
        <div ref={contentRef} className="relative h-full w-full" data-export-fill-node>
          <MemoizedRelationshipDiagramSvg
            groups={groups}
            spec={spec}
            exportId={id}
            measureText={fontMetricsReady}
            showLabelBoxGuides={showLabelBoxGuides}
            selectedItemId={selectedItemId}
            onItemSelect={selectItem}
          />
          {mediaPlacements.map((placement) => (
            <div
              key={placement.itemId}
              className="nodrag nopan nowheel absolute z-50 flex items-center gap-0.5"
              style={{
                left: placement.left,
                top: placement.top,
                transform: "translate(-100%, -100%)",
              }}
              data-relationship-diagram-item-media={placement.itemId}
              data-export-ignore
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <MediaAttachmentPreviewStrip attachments={placement.attachments} compact />
            </div>
          ))}
        </div>
        {selected && (
          <div
            className="pointer-events-none absolute inset-0 rounded-sm border-2 border-primary ring-2 ring-primary/20"
            data-export-ignore
          />
        )}
      </div>
      <NodeResizer
        minWidth={RELATIONSHIP_DIAGRAM_MIN_WIDTH}
        minHeight={RELATIONSHIP_DIAGRAM_MIN_HEIGHT}
        maxWidth={CHART_NODE_MAX_SIZE}
        maxHeight={CHART_NODE_MAX_SIZE}
        isVisible={selected && d.locked !== true}
        onResizeStart={() => beginManualNodeResize(id)}
        onResizeEnd={(_, params) => finishManualNodeResize(id, params)}
      />
      {selected && d.locked !== true && (
        <div
          className="absolute -left-3 -top-3 z-[70] flex h-8 w-8 cursor-grab items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-lg active:cursor-grabbing"
          title="Drag to move relationship diagram"
          aria-label="Drag to move relationship diagram"
          data-export-ignore
        >
          <Move className="h-4 w-4" />
        </div>
      )}
    </>
  );
}

export const RelationshipDiagramNode = memo(RelationshipDiagramNodeComponent);
