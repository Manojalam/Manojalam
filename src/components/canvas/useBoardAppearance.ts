"use client";
import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { boardAppearance } from "@/lib/canvas/board-colors";

export function useBoardAppearance() {
  const color = useCanvasStore(state => state.settings.canvasBackgroundColor);
  const mode = useCanvasStore(state => state.settings.canvasBackgroundMode);
  useEffect(() => {
    const previous = document.body.getAttribute("data-board-appearance");
    const appearance = boardAppearance(color, mode);
    if (appearance) document.body.setAttribute("data-board-appearance", appearance);
    else document.body.removeAttribute("data-board-appearance");
    return () => {
      if (previous) document.body.setAttribute("data-board-appearance", previous);
      else document.body.removeAttribute("data-board-appearance");
    };
  }, [color, mode]);
}
