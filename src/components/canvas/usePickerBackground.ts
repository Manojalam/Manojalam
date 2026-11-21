"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { boardAppearance } from "@/lib/canvas/board-colors";
import { resolveFillColor, resolveLayoutFillGradient } from "@/lib/style-utils";

/** Composite the selected surface over the canvas, including transparent fills. */
export function usePickerBackground(enabled = true) {
  const selected = useCanvasStore(state => state.selectedNodeIds.length === 1 ? state.nodes.find(node => node.id === state.selectedNodeIds[0]) : undefined);
  const cell = useUIStore(state => state.selectedTableCell);
  const [surface, setSurface] = useState<{ color: string; gradient?: string; appearance: "light" | "dark" }>();
  useEffect(() => {
    if (!enabled || !selected) { setSurface(undefined); return; }
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) return;
    const board = document.querySelector(".vidya-canvas-bg");
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    if (board) { context.fillStyle = getComputedStyle(board).backgroundColor; context.fillRect(0, 0, 1, 1); }
    context.fillStyle = resolveFillColor(selected.data) || "transparent";
    context.fillRect(0, 0, 1, 1);
    if (cell?.nodeId === selected.id) {
      const element = document.querySelector(`[data-id="${CSS.escape(selected.id)}"] [data-cell-row="${CSS.escape(cell.rowId)}"][data-cell-column="${CSS.escape(cell.columnId)}"]`);
      if (element) { context.fillStyle = getComputedStyle(element).backgroundColor; context.fillRect(0, 0, 1, 1); }
    }
    const pixel = context.getImageData(0, 0, 1, 1).data;
    const color = `#${Array.from(pixel.slice(0, 3)).map(value => value.toString(16).padStart(2, "0")).join("")}`;
    setSurface({ color, gradient: resolveLayoutFillGradient(selected.data), appearance: boardAppearance(color, "custom") ?? "light" });
  }, [enabled, selected, cell]);
  const style = surface ? { "--background": surface.color, "--popover": surface.color, backgroundColor: surface.color, color: "var(--foreground)", colorScheme: surface.appearance } as CSSProperties : undefined;
  return { surface, style };
}
