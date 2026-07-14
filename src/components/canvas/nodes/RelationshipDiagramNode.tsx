"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";

import {
  RelationshipDiagramSvg,
  relationshipDiagramDimensions,
} from "@/components/canvas/RelationshipDiagramSvg";
import { resetNodeDimensions } from "@/lib/layout";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import {
  buildRelationshipGroupsForSpec,
  normalizeRelationshipDiagramSpec,
} from "@/lib/relationship-diagram";
import type { RelationshipDiagramNodeData } from "@/lib/types";
import { useCanvasStore } from "@/store/canvas-store";

const FRAME_MIN_WIDTH = 420;
const FRAME_MIN_HEIGHT = 360;

function RelationshipDiagramNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as RelationshipDiagramNodeData;
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const relationships = useCanvasStore((state) => state.relationships);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const setSaveStatus = useCanvasStore((state) => state.setSaveStatus);
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
    () => buildRelationshipGroupsForSpec({
      spec,
      nodes,
      relationships,
      hierarchy,
    }),
    [hierarchy, nodes, relationships, spec]
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

  const fitToContent = useCallback(() => {
    const intrinsic = relationshipDiagramDimensions(groups, spec);
    const width = Math.max(FRAME_MIN_WIDTH, Math.ceil(intrinsic.width));
    const height = Math.max(FRAME_MIN_HEIGHT, Math.ceil(intrinsic.height));
    const store = useCanvasStore.getState();
    store.pushHistory();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => node.id === id
        ? resetNodeDimensions(node, width, height)
        : node),
      saveStatus: "unsaved",
    }));
  }, [groups, id, spec]);

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
      <NodeResizer
        minWidth={FRAME_MIN_WIDTH}
        minHeight={FRAME_MIN_HEIGHT}
        isVisible={selected && d.locked !== true}
        onResizeStart={() => pushHistory()}
        onResizeEnd={() => setSaveStatus("unsaved")}
      />
      <div
        className={d.locked === true
          ? "relative h-full w-full cursor-default overflow-visible"
          : "relative h-full w-full cursor-move overflow-visible"}
        style={{ background: spec.background || "transparent" }}
        aria-label={spec.title || "Relationship diagram"}
      >
        <div className="relative h-full w-full" data-export-fill-node>
          <RelationshipDiagramSvg
            groups={groups}
            spec={spec}
            exportId={id}
            measureText={fontMetricsReady}
          />
        </div>
        {selected && (
          <div
            className="pointer-events-none absolute inset-0 rounded-sm border-2 border-primary ring-2 ring-primary/20"
            data-export-ignore
          />
        )}
      </div>
    </>
  );
}

export const RelationshipDiagramNode = memo(RelationshipDiagramNodeComponent);
