"use client";

import type { Node } from "@xyflow/react";
import { AppColorPicker } from "./AppColorPicker";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { FONT_OPTIONS } from "@/lib/fonts";
import { useCanvasStore } from "@/store/canvas-store";
import { normalizeWholeTextFormat } from "@/lib/canvas/whole-text-format";
import { MAX_BOARD_FONT_SIZE, MIN_BOARD_FONT_SIZE, normalizeWholeBoxFontSize } from "@/lib/canvas/board-typography";
import { selectionNodeTextStylePatch, selectionNodeTextStyleValue, supportsSelectionTextStyle, type SelectionTextStyleKey } from "@/lib/canvas/selection-text-style";

/** Same whole-object formatting as Properties; inline editing keeps its own text toolbar. */
export function QuickTextFormat({ nodes }: { nodes: Node[] }) {
  const settings = useCanvasStore(state => state.settings);
  const layers = useCanvasStore(state => state.layers);
  const targets = nodes.filter(node => !layers.some(layer => layer.id === node.data.layerId && layer.locked) && !node.data.locked && supportsSelectionTextStyle(node));
  if (!targets.length) return null;
  const common = (key: SelectionTextStyleKey) => {
    const values = targets.map(node => selectionNodeTextStyleValue(node, key));
    return values.every(value => value === values[0]) ? values[0] : undefined;
  };
  const apply = (key: SelectionTextStyleKey, value: unknown) => {
    const store = useCanvasStore.getState();
    store.pushHistory();
    targets.forEach(node => {
      const base = key === "fontSize"
        ? { ...normalizeWholeBoxFontSize(node.data, Number(value)), layoutAutoTypography: false }
        : normalizeWholeTextFormat(node.data, key, value);
      if (key === "textColor") base.layoutAutoText = false;
      store.updateNodeData(node.id, selectionNodeTextStylePatch(node, key, value, base));
    });
  };
  const align = (value: string) => {
    const store = useCanvasStore.getState(); store.pushHistory();
    targets.filter(node => ["shape", "text", "sticky", "mindmap", "frame"].includes(node.type ?? "")).forEach(node => store.updateNodeData(node.id, normalizeWholeTextFormat(node.data, "textAlign", value)));
  };
  const color = common("textColor");
  const font = common("fontFamily");
  const size = common("fontSize");
  const bold = common("fontWeight") === "bold";
  const italic = common("fontStyle") === "italic";
  return <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Text formatting">
    <select aria-label="Font for selected objects" title="Font for selected objects" className="h-8 w-32 rounded border bg-background px-1 text-xs" value={typeof font === "string" ? font : ""} onChange={event => apply("fontFamily", event.target.value || undefined)}>
      <option value="">Board font / mixed</option>
      {FONT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <input key={`${nodes.map(node => node.id).join(":")}:${String(size)}`} type="number" aria-label="Font size for selected objects" title="Font size for selected objects" className="h-8 w-14 rounded border bg-background px-1 text-xs" min={MIN_BOARD_FONT_SIZE} max={MAX_BOARD_FONT_SIZE} defaultValue={typeof size === "number" ? size : ""} placeholder={String(settings.defaultFontSize)} onBlur={event => {
      const value = Number(event.currentTarget.value);
      if (event.currentTarget.value && Number.isFinite(value) && value >= MIN_BOARD_FONT_SIZE && value <= MAX_BOARD_FONT_SIZE && value !== size) apply("fontSize", value);
    }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); }} />
    <button type="button" aria-label="Bold selected objects" title="Bold selected objects" aria-pressed={bold} className={`h-8 rounded px-2 hover:bg-accent ${bold ? "bg-primary/15 text-primary" : ""}`} onClick={() => apply("fontWeight", bold ? "normal" : "bold")}><Bold className="h-4 w-4" /></button>
    <button type="button" aria-label="Italic selected objects" title="Italic selected objects" aria-pressed={italic} className={`h-8 rounded px-2 hover:bg-accent ${italic ? "bg-primary/15 text-primary" : ""}`} onClick={() => apply("fontStyle", italic ? "normal" : "italic")}><Italic className="h-4 w-4" /></button>
    <AppColorPicker value={typeof color === "string" ? color : undefined} onChange={value => apply("textColor", value || undefined)}>
      <button type="button" aria-label="Text color for selected objects" title="Text color" className="h-8 rounded border px-2 text-xs">A<span className="block h-1 w-4" style={{ background: typeof color === "string" ? color : "currentColor" }} /></button>
    </AppColorPicker>
    {targets.some(node => ["shape", "text", "sticky", "mindmap", "frame"].includes(node.type ?? "")) && ([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([value, Icon]) => <button type="button" key={value} aria-label={`Align selected text ${value}`} title={`Align text ${value}`} className="h-8 rounded px-2 hover:bg-accent" onClick={() => align(value)}><Icon className="h-4 w-4" /></button>)}
  </div>;
}
