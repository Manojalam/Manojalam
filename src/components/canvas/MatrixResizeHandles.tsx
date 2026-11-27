"use client";

import { useRef, useState } from "react";
import { ViewportPortal, useReactFlow, useViewport } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas-store";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import { createNodeRect, getNodeRect } from "@/lib/layout/geometry";

type Size = { width: number; height: number };
type Axis = "both" | "width" | "height";

/** Resize the whole chart, independently of the header's own cell handles. */
export function MatrixResizeHandles() {
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const selectedIds = useCanvasStore(state => state.selectedNodeIds);
  const layers = useCanvasStore(state => state.layers);
  const { screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();
  const [preview, setPreview] = useState<Size | null>(null);
  const gesture = useRef<{ rootId: string; axis: Axis; start: { x: number; y: number }; size: Size; next: Size } | null>(null);
  const root = selectedIds.length === 1 ? nodes.find(node => node.id === selectedIds[0] && node.data.layoutMode === "matrix") : null;
  if (!root || root.data.locked || layers.some(layer => layer.id === root.data.layerId && layer.locked)) return null;
  const ids = new Set(getSubtree(root.id, buildHierarchy(nodes, edges)));
  const rects = nodes.filter(node => !node.hidden && ids.has(node.id)).map(getNodeRect);
  const left = Math.min(...rects.map(rect => rect.left));
  const top = Math.min(...rects.map(rect => rect.top));
  const size = {
    width: Math.max(...rects.map(rect => rect.right)) - left,
    height: Math.max(...rects.map(rect => rect.bottom)) - top,
  };
  const displayed = preview ?? size;
  const handleSize = 14 / zoom;
  return <ViewportPortal>
    <div data-export-ignore data-matrix-resize-outline className="pointer-events-none absolute z-50 border border-dashed border-primary"
      style={{ left, top, width: displayed.width, height: displayed.height }}>
      {(["width", "height", "both"] as const).map(axis => <button key={axis}
        type="button" aria-label={axis === "both" ? "Resize whole matrix" : `Resize matrix ${axis}`}
        title={axis === "both" ? "Drag to scale the whole Matrix" : `Drag to change Matrix ${axis}`}
        className="nodrag nopan pointer-events-auto absolute rounded-sm border-2 border-primary bg-background"
        onClick={event => event.stopPropagation()}
        style={{ width: handleSize, height: handleSize, left: axis === "height" ? "50%" : "100%",
          top: axis === "width" ? "50%" : "100%", transform: "translate(-50%, -50%)",
          cursor: axis === "both" ? "nwse-resize" : axis === "width" ? "ew-resize" : "ns-resize", touchAction: "none" }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { rootId: root.id, axis, start: screenToFlowPosition({ x: event.clientX, y: event.clientY }), size, next: size };
          setPreview(size);
        }}
        onPointerMove={event => {
          const drag = gesture.current;
          if (!drag) return;
          event.preventDefault(); event.stopPropagation();
          const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          let width = drag.size.width + point.x - drag.start.x;
          let height = drag.size.height + point.y - drag.start.y;
          if (drag.axis === "both") {
            const scale = Math.max(160 / drag.size.width, 100 / drag.size.height,
              (width * drag.size.width + height * drag.size.height) / (drag.size.width ** 2 + drag.size.height ** 2));
            width = drag.size.width * scale; height = drag.size.height * scale;
          }
          drag.next = { width: drag.axis === "height" ? drag.size.width : Math.max(160, width),
            height: drag.axis === "width" ? drag.size.height : Math.max(100, height) };
          setPreview(drag.next);
          window.dispatchEvent(new CustomEvent("canvas-resize-preview", { detail: { rect: createNodeRect(root.id, left, top, drag.next.width, drag.next.height), excludedIds: [...ids] } }));
        }}
        onPointerUp={event => {
          event.stopPropagation();
          const drag = gesture.current;
          gesture.current = null; setPreview(null);
          window.dispatchEvent(new CustomEvent("canvas-resize-preview", { detail: null }));
          if (!drag || (Math.abs(drag.next.width - drag.size.width) < 1 && Math.abs(drag.next.height - drag.size.height) < 1)) return;
          const state = useCanvasStore.getState();
          state.pushHistory();
          state.updateNodeData(drag.rootId, { matrixTableWidthOverride: drag.next.width, matrixTableHeightOverride: drag.next.height, matrixTableSizeLocked: true });
          state.scheduleMatrixReflow(drag.rootId);
        }}
        onPointerCancel={() => { gesture.current = null; setPreview(null); window.dispatchEvent(new CustomEvent("canvas-resize-preview", { detail: null })); }}
      />)}
      {preview && <span className="absolute left-0 top-full whitespace-nowrap rounded bg-background px-1 text-primary"
        style={{ fontSize: 12 / zoom }}>{Math.round(preview.width)} × {Math.round(preview.height)} px</span>}
    </div>
  </ViewportPortal>;
}
