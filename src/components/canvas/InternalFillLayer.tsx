"use client";

/**
 * InternalFillLayer
 *
 * Renders stored internal fill regions inside a node using SVG. Supports:
 *  - freeform regions (drawn while `isDrawingMode` is on)
 *  - predefined resizable/movable shapes (rect, circle, ellipse, diamond, triangle)
 *
 * Rendering order inside the node: base fill → this layer → text → border.
 * Coordinates are stored as 0–100 percentages so regions scale with the node.
 */

import { useRef, useState, useCallback } from "react";
import type { InternalFillRegion, InternalFillKind } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

function pts2path(pts: Pt[]): string {
  if (pts.length < 2) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z";
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

interface InternalFillLayerProps {
  regions: InternalFillRegion[];
  isDrawingMode: boolean;
  drawingColor: string;
  drawingOpacity: number;
  /** Fallback opacity for legacy regions with no explicit opacity */
  fillOpacity?: number;
  /** When true (node selected & not drawing) predefined shapes are movable/resizable */
  interactive?: boolean;
  onRegionAdded: (region: InternalFillRegion) => void;
  onRegionUpdated?: (id: string, patch: Partial<InternalFillRegion>) => void;
}

export function InternalFillLayer({
  regions,
  isDrawingMode,
  drawingColor,
  drawingOpacity,
  fillOpacity = 0.18,
  interactive = false,
  onRegionAdded,
  onRegionUpdated,
}: InternalFillLayerProps) {
  const svgRef    = useRef<SVGSVGElement>(null);
  const drawing   = useRef(false);
  const pointsRef = useRef<Pt[]>([]);
  const [livePoints, setLivePoints] = useState<Pt[]>([]);

  // Drag/resize state for predefined shapes
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; start: Pt; rect: Rect } | null>(null);

  const toLocal = (e: React.PointerEvent): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width)  * 100),
      y: clamp(((e.clientY - rect.top)  / rect.height) * 100),
    };
  };

  // ── Freeform drawing ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    e.stopPropagation();
    e.preventDefault();
    drawing.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = [toLocal(e)];
    pointsRef.current = p;
    setLivePoints(p);
  }, [isDrawingMode]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawingMode || !drawing.current) return;
    e.stopPropagation();
    const pt = toLocal(e);
    const last = pointsRef.current[pointsRef.current.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.5) return;
    pointsRef.current = [...pointsRef.current, pt];
    setLivePoints(pointsRef.current);
  }, [isDrawingMode]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawingMode || !drawing.current) return;
    e.stopPropagation();
    drawing.current = false;
    const captured = pointsRef.current;
    pointsRef.current = [];
    setLivePoints([]);
    if (captured.length > 3) {
      onRegionAdded({
        id: generateId(), kind: "free", points: [...captured],
        fillColor: drawingColor, opacity: drawingOpacity,
        createdAt: new Date().toISOString(),
      });
    }
  }, [isDrawingMode, drawingColor, drawingOpacity, onRegionAdded]);

  // ── Move / resize predefined shapes ──
  const beginDrag = (e: React.PointerEvent, id: string, mode: "move" | "resize", rect: Rect) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id, mode, start: toLocal(e), rect };
  };

  const dragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !onRegionUpdated) return;
    e.stopPropagation();
    const cur = toLocal(e);
    const dx = cur.x - drag.start.x;
    const dy = cur.y - drag.start.y;
    if (drag.mode === "move") {
      onRegionUpdated(drag.id, { rect: {
        x: clamp(drag.rect.x + dx, 0, 100 - drag.rect.w),
        y: clamp(drag.rect.y + dy, 0, 100 - drag.rect.h),
        w: drag.rect.w, h: drag.rect.h,
      }});
    } else {
      onRegionUpdated(drag.id, { rect: {
        x: drag.rect.x, y: drag.rect.y,
        w: clamp(drag.rect.w + dx, 5, 100 - drag.rect.x),
        h: clamp(drag.rect.h + dy, 5, 100 - drag.rect.y),
      }});
    }
  };

  const dragEnd = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  const renderShape = (r: InternalFillRegion) => {
    const kind: InternalFillKind = r.kind ?? "free";
    const op = r.opacity ?? fillOpacity;
    const common = { fill: r.fillColor, fillOpacity: op, strokeWidth: 0 } as const;

    if (kind === "free") {
      return <path key={r.id} d={pts2path(r.points ?? [])} {...common} />;
    }
    const rc = r.rect ?? { x: 30, y: 30, w: 40, h: 40 };
    const cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2;

    let shape: React.ReactNode;
    if (kind === "rect") {
      shape = <rect x={rc.x} y={rc.y} width={rc.w} height={rc.h} rx={2} {...common} />;
    } else if (kind === "circle" || kind === "ellipse") {
      shape = <ellipse cx={cx} cy={cy} rx={rc.w / 2} ry={rc.h / 2} {...common} />;
    } else if (kind === "diamond") {
      shape = <polygon points={`${cx},${rc.y} ${rc.x + rc.w},${cy} ${cx},${rc.y + rc.h} ${rc.x},${cy}`} {...common} />;
    } else { // triangle
      shape = <polygon points={`${cx},${rc.y} ${rc.x + rc.w},${rc.y + rc.h} ${rc.x},${rc.y + rc.h}`} {...common} />;
    }

    return (
      <g key={r.id}>
        {shape}
        {interactive && (
          <>
            {/* invisible move surface */}
            <rect x={rc.x} y={rc.y} width={rc.w} height={rc.h} fill="transparent"
              className="nodrag nopan cursor-move"
              style={{ pointerEvents: "all" }}
              onPointerDown={(e) => beginDrag(e, r.id, "move", rc)}
              onPointerMove={dragMove}
              onPointerUp={dragEnd} />
            {/* outline */}
            <rect x={rc.x} y={rc.y} width={rc.w} height={rc.h} fill="none"
              stroke="#4262ff" strokeWidth={1} strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
            {/* resize handle (bottom-right) */}
            <rect x={rc.x + rc.w - 3} y={rc.y + rc.h - 3} width={6} height={6}
              fill="#4262ff" className="nodrag nopan cursor-se-resize"
              style={{ pointerEvents: "all" }}
              onPointerDown={(e) => beginDrag(e, r.id, "resize", rc)}
              onPointerMove={dragMove}
              onPointerUp={dragEnd} />
          </>
        )}
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn(
        "absolute inset-0 h-full w-full",
        // Always keep fill regions visually behind the text (z-[1]); while
        // drawing we lift to z-20 so the crosshair captures over everything.
        isDrawingMode ? "nodrag nopan cursor-crosshair z-20" : "z-[1]"
      )}
      // Root only captures events while drawing. When merely interactive, empty
      // areas pass through (so node drag/dbl-click still work) and only the
      // shape move-surfaces / resize-handles (pointerEvents:all) capture.
      style={{ pointerEvents: isDrawingMode ? "auto" : "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {regions.map(renderShape)}

      {/* Live preview while free-drawing */}
      {livePoints.length > 1 && (
        <path d={pts2path(livePoints)} fill={drawingColor} fillOpacity={drawingOpacity * 0.6}
          stroke={drawingColor} strokeWidth="0.4" strokeDasharray="2 1" />
      )}

      {/* Drawing-mode indicator */}
      {isDrawingMode && (
        <rect x="0.5" y="0.5" width="99" height="99" fill="none"
          stroke="#4262ff" strokeWidth="0.8" strokeDasharray="4 2" />
      )}
    </svg>
  );
}
