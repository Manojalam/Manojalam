"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

interface ToolbarOffset {
  x: number;
  y: number;
}

interface ToolbarDrag {
  pointerId: number;
  resetKey: unknown;
  startPointer: ToolbarOffset;
  startOffset: ToolbarOffset;
  startRect: DOMRect;
}

interface ToolbarPosition {
  resetKey: unknown;
  offset: ToolbarOffset;
}

export interface MovableToolbarControls {
  dragging: boolean;
  positionStyle: CSSProperties | undefined;
  resetPosition: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

const VIEWPORT_MARGIN = 8;
const ZERO_TOOLBAR_OFFSET: ToolbarOffset = { x: 0, y: 0 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function useMovableToolbar(
  containerSelector: string,
  resetKey: unknown
): MovableToolbarControls {
  const [position, setPosition] = useState<ToolbarPosition>({
    resetKey,
    offset: ZERO_TOOLBAR_OFFSET,
  });
  const [dragging, setDragging] = useState<{
    resetKey: unknown;
    active: boolean;
  }>({
    resetKey,
    active: false,
  });
  const dragRef = useRef<ToolbarDrag | null>(null);
  const offset = Object.is(position.resetKey, resetKey)
    ? position.offset
    : ZERO_TOOLBAR_OFFSET;
  const activelyDragging = Object.is(dragging.resetKey, resetKey) && dragging.active;

  const resetPosition = useCallback(() => {
    dragRef.current = null;
    setDragging({ resetKey, active: false });
    setPosition({ resetKey, offset: ZERO_TOOLBAR_OFFSET });
  }, [resetKey]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.closest<HTMLElement>(containerSelector);
    if (!container) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      resetKey,
      startPointer: { x: event.clientX, y: event.clientY },
      startOffset: offset,
      startRect: container.getBoundingClientRect(),
    };
    setDragging({ resetKey, active: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [containerSelector, offset, resetKey]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (
      !drag
      || drag.pointerId !== event.pointerId
      || !Object.is(drag.resetKey, resetKey)
    ) return;
    event.preventDefault();
    event.stopPropagation();
    const desiredLeft = drag.startRect.left + event.clientX - drag.startPointer.x;
    const desiredTop = drag.startRect.top + event.clientY - drag.startPointer.y;
    const left = clamp(
      desiredLeft,
      VIEWPORT_MARGIN,
      window.innerWidth - drag.startRect.width - VIEWPORT_MARGIN
    );
    const top = clamp(
      desiredTop,
      VIEWPORT_MARGIN,
      window.innerHeight - drag.startRect.height - VIEWPORT_MARGIN
    );
    setPosition({
      resetKey,
      offset: {
        x: drag.startOffset.x + left - drag.startRect.left,
        y: drag.startOffset.y + top - drag.startRect.top,
      },
    });
  }, [resetKey]);

  const onPointerEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (
      !drag
      || drag.pointerId !== event.pointerId
      || !Object.is(drag.resetKey, resetKey)
    ) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDragging({ resetKey, active: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [resetKey]);

  return {
    dragging: activelyDragging,
    positionStyle: offset.x || offset.y
      ? { translate: `${offset.x}px ${offset.y}px` }
      : undefined,
    resetPosition,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
  };
}

export function MovableToolbarHandle({
  controls,
  label,
  className,
}: {
  controls: MovableToolbarControls;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={`${label}. Double-click to reset its position.`}
      aria-label={label}
      className={cn(
        "nodrag nopan touch-none flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        controls.dragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      onPointerDown={controls.onPointerDown}
      onPointerMove={controls.onPointerMove}
      onPointerUp={controls.onPointerEnd}
      onPointerCancel={controls.onPointerEnd}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        controls.resetPosition();
      }}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
