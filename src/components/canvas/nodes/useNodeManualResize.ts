"use client";

import { useCallback } from "react";
import type { ResizeParams } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas-store";

export function useNodeManualResize(nodeId: string) {
  const beginManualNodeResize = useCanvasStore((state) => state.beginManualNodeResize);
  const finishManualNodeResize = useCanvasStore((state) => state.finishManualNodeResize);

  const onResizeStart = useCallback(() => {
    beginManualNodeResize(nodeId);
  }, [beginManualNodeResize, nodeId]);

  const onResizeEnd = useCallback((_: unknown, params: ResizeParams) => {
    finishManualNodeResize(nodeId, { width: params.width, height: params.height });
  }, [finishManualNodeResize, nodeId]);

  return { onResizeStart, onResizeEnd };
}
