"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { RotateCw } from "lucide-react";
import { normalizeTextRotation } from "@/lib/canvas/text-rotation";
import { useCanvasStore } from "@/store/canvas-store";

type TextRotationDrag = {
  pointerId: number;
  centerX: number;
  centerY: number;
  startPointerAngle: number;
  startRotation: number;
};

function pointerAngle(event: ReactPointerEvent, centerX: number, centerY: number): number {
  return (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
}

function unwrapAngle(angle: number, reference: number): number {
  let unwrapped = angle;
  while (unwrapped - reference > 180) unwrapped -= 360;
  while (unwrapped - reference < -180) unwrapped += 360;
  return unwrapped;
}

export function TextRotationHandle({
  nodeId,
  targetRef,
  rotation = 0,
  color = "#6366f1",
}: {
  nodeId: string;
  targetRef: RefObject<HTMLElement | null>;
  rotation?: number;
  color?: string;
}) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const selectedNodeCount = useCanvasStore((state) => state.selectedNodeIds.length);
  const dragRef = useRef<TextRotationDrag | null>(null);

  const updateRotation = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const currentPointerAngle = pointerAngle(event, drag.centerX, drag.centerY);
    const pointerDelta = unwrapAngle(currentPointerAngle, drag.startPointerAngle) - drag.startPointerAngle;
    const rawRotation = drag.startRotation + pointerDelta;
    const steppedRotation = event.shiftKey ? Math.round(rawRotation / 15) * 15 : Math.round(rawRotation);
    updateNodeData(nodeId, { textRotation: normalizeTextRotation(steppedRotation) });
  }, [nodeId, updateNodeData]);

  const finishRotation = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const startRotation = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = targetRef.current;
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    dragRef.current = {
      pointerId: event.pointerId,
      centerX,
      centerY,
      startPointerAngle: pointerAngle(event, centerX, centerY),
      startRotation: normalizeTextRotation(rotation),
    };
    pushHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  if (selectedNodeCount > 1) return null;

  return (
    <button
      type="button"
      data-export-ignore
      aria-label="Rotate text"
      title="Rotate text (drag; hold Shift to snap 15°)"
      className="nodrag nopan absolute left-1/2 -top-8 z-40 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background shadow-md transition-transform hover:scale-110 active:cursor-grabbing"
      style={{ backgroundColor: color, cursor: "grab" }}
      onPointerDown={startRotation}
      onPointerMove={updateRotation}
      onPointerUp={finishRotation}
      onPointerCancel={finishRotation}
      onLostPointerCapture={finishRotation}
      onClick={(event) => event.stopPropagation()}
    >
      <RotateCw className="h-3.5 w-3.5 text-white" />
    </button>
  );
}
