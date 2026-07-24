"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import type {
  TextCalloutDirection,
  TextFrameStyle,
} from "@/lib/types";
import { speechBubblePath, textFrameBodyBox } from "@/lib/canvas/text-callout";
import type { Point, Size } from "@/lib/canvas/node-geometry";

function thoughtDots(direction: TextCalloutDirection) {
  if (direction === "top") return [{ cx: 38, cy: 12, r: 6 }, { cx: 30, cy: 3, r: 3 }];
  if (direction === "right") return [{ cx: 88, cy: 38, r: 6 }, { cx: 97, cy: 30, r: 3 }];
  if (direction === "left") return [{ cx: 12, cy: 62, r: 6 }, { cx: 3, cy: 70, r: 3 }];
  return [{ cx: 62, cy: 88, r: 6 }, { cx: 70, cy: 97, r: 3 }];
}

interface TextCalloutSurfaceProps {
  style: Exclude<TextFrameStyle, "plain">;
  direction: TextCalloutDirection;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  selected?: boolean;
  filter?: string;
  size: Size;
  tailTip: Point;
  onTailDragStart?: () => void;
  onTailTipChange?: (anchor: Point) => void;
}

export function TextCalloutSurface({
  style,
  direction,
  fillColor,
  borderColor,
  borderWidth,
  borderStyle,
  selected,
  filter,
  size,
  tailTip,
  onTailDragStart,
  onTailTipChange,
}: TextCalloutSurfaceProps) {
  const { screenToFlowPosition } = useReactFlow();
  const anchorPointerIdRef = useRef<number | null>(null);
  const strokeDasharray = borderStyle === "dashed"
    ? `${Math.max(1, borderWidth) * 2.5} ${Math.max(1, borderWidth) * 1.5}`
    : borderStyle === "dotted" ? `0.1 ${Math.max(1, borderWidth) * 2}` : undefined;
  const outline = {
    fill: fillColor,
    stroke: borderWidth > 0 ? borderColor : "none",
    strokeWidth: Math.max(0, borderWidth),
    strokeDasharray,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  const selectionOutline = {
    fill: "none",
    stroke: "#4262ff",
    strokeWidth: 2,
    strokeDasharray: "4 3",
    vectorEffect: "non-scaling-stroke" as const,
  };
  const thoughtBody = textFrameBodyBox("thought", direction);
  const dots = thoughtDots(direction);
  const speechPath = speechBubblePath(direction, size, tailTip);
  const finishAnchorDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (anchorPointerIdRef.current !== event.pointerId) return;
    anchorPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ filter }}
      data-text-frame-style={style}
      data-text-callout-direction={direction}
    >
      <svg
        viewBox={style === "speech"
          ? `0 0 ${Math.max(1, size.width)} ${Math.max(1, size.height)}`
          : "0 0 100 100"}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {style === "speech" ? (
          <>
            <path data-export-bounds d={speechPath} {...outline} />
            {selected && <path data-export-ignore d={speechPath} {...selectionOutline} />}
          </>
        ) : (
          <>
            <rect
              x={thoughtBody.x}
              y={thoughtBody.y}
              width={thoughtBody.width}
              height={thoughtBody.height}
              rx="14"
              {...outline}
            />
            {dots.map((dot, index) => (
              <circle key={index} {...dot} {...outline} />
            ))}
            {selected && (
              <rect
                x={thoughtBody.x}
                y={thoughtBody.y}
                width={thoughtBody.width}
                height={thoughtBody.height}
                rx="14"
                {...selectionOutline}
              />
            )}
          </>
        )}
      </svg>
      {style === "speech" && selected && (
        <button
          data-export-ignore
          type="button"
          aria-label="Move speech pointer tip"
          title="Drag to point this callout at related content"
          className="nodrag nopan pointer-events-auto absolute z-30 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-primary shadow-md ring-1 ring-primary/40"
          style={{ left: tailTip.x, top: tailTip.y }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            anchorPointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            onTailDragStart?.();
          }}
          onPointerMove={(event) => {
            if (anchorPointerIdRef.current !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            onTailTipChange?.(screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }));
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            finishAnchorDrag(event);
          }}
          onPointerCancel={finishAnchorDrag}
        />
      )}
    </div>
  );
}
