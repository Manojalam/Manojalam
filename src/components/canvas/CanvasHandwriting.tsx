"use client";
import { useEffect, useRef, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { InkPaths } from "./nodes/HandwritingNode";
import { normalizeInk, strokeNear, MAX_INK_POINTS, type InkData, type InkPoint, type InkStroke } from "@/lib/canvas/handwriting";
import { resolveObjectRotation } from "@/lib/canvas/object-rotation";
import { plainTextToRichText } from "@/lib/canvas/rich-text-paste";
export function CanvasHandwriting() {
  const tool = useUIStore(s => s.activeTool);
  const boardId = useCanvasStore(s => s.board?.id);
  const nodes = useCanvasStore(s => s.nodes);
  const ids = useCanvasStore(s => s.selectedNodeIds);
  const viewport = useViewport();
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
  const [mode, setMode] = useState<"pen" | "highlighter" | "eraser">("pen");
  const [color, setColor] = useState("#6366f1");
  const [width, setWidth] = useState(2);
  const [language, setLanguage] = useState("mixed");
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const gesture = useRef<{ pointer: number; stroke: InkStroke } | null>(null);
  const session = useRef<string | null>(null);
  const [review, setReview] = useState<{ id: string; ink: InkData; text: string } | null>(null);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const selected = ids.length === 1 ? nodes.find(n => n.id === ids[0] && n.type === "handwriting") : undefined;
  const canChange = (id?: string) => {
    const state = useCanvasStore.getState();
    const node = id ? state.nodes.find(n => n.id === id) : undefined;
    return state.board?.accessRole !== "viewer" && !useUIStore.getState().presentationMode &&
      (!id || (!!node && !node.data.locked && !state.layers.some(l => l.id === node.data.layerId && l.locked)));
  };
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    abort.current?.abort(); setReview(null); setError(""); setBusy(false);
    gesture.current = null; setDraft(null); session.current = null;
  }, [boardId]);
  useEffect(() => {
    gesture.current = null; setDraft(null);
    session.current = tool === "pen" ? selected?.id ?? null : null;
    // Undo can restore an erased note while the pen remains active.
  }, [tool, selected?.id]);
  const point = (event: { clientX: number; clientY: number; pressure: number; pointerType: string }): InkPoint => ({
    ...screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    pressure: event.pointerType === "pen" ? Math.max(0.1, event.pressure) : 0.5,
  });
  const commit = (stroke: InkStroke) => {
    const state = useCanvasStore.getState();
    const previous = state.nodes.find(n => n.id === session.current && n.type === "handwriting");
    if (!canChange(previous?.id)) return;
    const ink = previous?.data.ink as InkData | undefined;
    const origin = previous ? getInternalNode(previous.id)?.internals.positionAbsolute ?? previous.position : { x: 0, y: 0 };
    const displayWidth = Number(previous?.style?.width) || ink?.width || 1;
    const displayHeight = Number(previous?.style?.height) || ink?.height || 1;
    const angle = resolveObjectRotation(previous?.type, previous?.data) * Math.PI / 180;
    const old = ink?.strokes.map(s => ({ ...s, width: s.width * Math.sqrt(displayWidth / ink.width * displayHeight / ink.height), points: s.points.map(p => {
      const x = p.x * displayWidth / ink.width - displayWidth / 2, y = p.y * displayHeight / ink.height - displayHeight / 2;
      return { ...p, x: origin.x + displayWidth / 2 + x * Math.cos(angle) - y * Math.sin(angle), y: origin.y + displayHeight / 2 + x * Math.sin(angle) + y * Math.cos(angle) };
    }) })) ?? [];
    let strokes: InkStroke[];
    if (mode === "eraser") {
      strokes = old.filter(s => !stroke.points.some(p => strokeNear(s, p)));
      if (strokes.length === old.length) return;
    } else {
      if (old.reduce((sum, s) => sum + s.points.length, stroke.points.length) > MAX_INK_POINTS) { setError("This note is full. Choose New handwriting to continue."); return; }
      strokes = [...old, stroke];
    }
    state.pushHistory();
    if (!strokes.length) {
      state.setNodes(ns => ns.filter(n => n.id !== previous?.id));
      useCanvasStore.setState({ selectedNodeIds: [] }); session.current = null; return;
    }
    const normalized = normalizeInk(strokes);
    const id = previous?.id ?? crypto.randomUUID();
    const node = { ...previous, id, type: "handwriting", position: { x: normalized.position.x - (origin.x - (previous?.position.x ?? 0)), y: normalized.position.y - (origin.y - (previous?.position.y ?? 0)) },
      style: { ...previous?.style, width: normalized.ink.width, height: normalized.ink.height },
      data: { ...previous?.data, ink: normalized.ink, objectRotation: 0 }, selected: true };
    state.setNodes(ns => [...ns.filter(n => n.id !== id).map(n => ({ ...n, selected: false })), node]);
    useCanvasStore.setState({ selectedNodeIds: [id], selectedEdgeIds: [] }); session.current = id;
  };
  const convert = async () => {
    if (!selected || !canChange(selected.id)) return;
    const ink = selected.data.ink as InkData;
    if (!ink?.strokes.some(s => !s.highlighter)) { setError("Write with the pen before converting."); return; }
    const controller = new AbortController(); abort.current = controller;
    setError(""); setBusy(true); setProgress(0); setReview(null);
    const timeout = window.setTimeout(() => { controller.abort(); setError("Conversion took too long. Try a shorter passage; the handwriting is unchanged."); }, 60000);
    try {
      const { recognizeHandwriting } = await import("@/lib/canvas/handwriting-recognition");
      controller.signal.throwIfAborted();
      const text = await recognizeHandwriting(ink, language, controller.signal, setProgress);
      if (!controller.signal.aborted) setReview({ id: selected.id, ink, text });
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Conversion failed."); }
    finally { window.clearTimeout(timeout); if (abort.current === controller) { setBusy(false); abort.current = null; } }
  };
  const accept = () => {
    if (!review || !review.text.trim() || !canChange(review.id)) return;
    const state = useCanvasStore.getState(), source = state.nodes.find(n => n.id === review.id);
    if (!source || JSON.stringify(source.data.ink) !== JSON.stringify(review.ink)) { setError("The handwriting changed. Convert it again before accepting."); return; }
    const id = crypto.randomUUID();
    const textNode = { id, type: "text", selected: true,
      position: { x: (getInternalNode(source.id)?.internals.positionAbsolute.x ?? source.position.x) + (keep ? Number(source.style?.width) + 24 || review.ink.width + 24 : 0), y: getInternalNode(source.id)?.internals.positionAbsolute.y ?? source.position.y },
      style: { width: Math.max(240, Math.min(700, review.ink.width)) },
      data: { text: review.text, richText: plainTextToRichText(review.text), fontFamily: state.settings.defaultFont, fontSize: state.settings.defaultFontSize } };
    state.pushHistory();
    state.setNodes(ns => [...ns.filter(n => keep || n.id !== source.id).map(n => ({ ...n, selected: false })), textNode]);
    useCanvasStore.setState({ selectedNodeIds: [id], selectedEdgeIds: [] });
    setReview(null); setError(""); useUIStore.getState().setActiveTool("select");
  };
  if (tool !== "pen" && !selected && !review && !busy) return null;
  const disabled = !canChange(selected?.id);
  return <>
    {tool === "pen" && !review && !busy && <svg data-export-ignore aria-label="Handwriting canvas" className="absolute inset-0 z-30 h-full w-full" style={{ touchAction: "none", cursor: "crosshair" }}
      onPointerDown={event => {
        if (!canChange(session.current ?? undefined) || gesture.current || event.button !== 0 || (event.pointerType === "touch" && !event.isPrimary)) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        const stroke: InkStroke = { id: crypto.randomUUID(), color, width: mode === "highlighter" ? width * 5 : width, highlighter: mode === "highlighter", points: [point(event)] };
        gesture.current = { pointer: event.pointerId, stroke }; setDraft(stroke);
      }}
      onPointerMove={event => {
        const active = gesture.current; if (!active || active.pointer !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
        const points = [...active.stroke.points];
        for (const sample of samples.length ? samples : [event.nativeEvent]) {
          const p = point(sample), last = points.at(-1)!;
          if (points.length < 10000 && Math.hypot(last.x - p.x, last.y - p.y) > 0.5) points.push(p);
        }
        active.stroke = { ...active.stroke, points }; setDraft(active.stroke);
      }}
      onPointerUp={event => {
        const active = gesture.current; if (!active || active.pointer !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation(); gesture.current = null; setDraft(null);
        commit(active.stroke);
      }}
      onPointerCancel={() => { gesture.current = null; setDraft(null); }}
      onLostPointerCapture={() => { gesture.current = null; setDraft(null); }}>
      {draft && mode !== "eraser" && <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}><InkPaths strokes={[draft]} /></g>}
    </svg>}
    <section data-export-ignore aria-label="Handwriting tools" className="nodrag nopan nowheel absolute left-16 top-3 z-40 max-h-[80%] w-[min(440px,calc(100%-5rem))] space-y-3 overflow-auto rounded-lg border bg-background p-3 shadow-lg" onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><strong>Handwriting</strong><button onClick={() => { abort.current?.abort(); setReview(null); setError(""); useUIStore.getState().setActiveTool("select"); useCanvasStore.setState({ selectedNodeIds: [], nodes: useCanvasStore.getState().nodes.map(n => ({ ...n, selected: false })) }); }}>Close</button></div>
      {review ? <>
        <p className="text-xs text-muted-foreground">Review and correct the text. Your original handwriting is unchanged.</p>
        <textarea aria-label="Recognized text" className="min-h-36 w-full rounded border bg-background p-2" value={review.text} onChange={e => setReview({ ...review, text: e.target.value })} />
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />Keep handwriting beside the text</label>
        <div className="flex gap-3"><button disabled={!canChange(review.id) || !review.text.trim()} onClick={accept}>Accept conversion</button><button onClick={() => { setReview(null); setError(""); }}>Cancel conversion</button></div>
      </> : <>
        <div className="flex flex-wrap gap-2">
          {(["pen","highlighter","eraser"] as const).map(value => <button key={value} aria-pressed={mode === value && tool === "pen"} className="rounded border px-2 py-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground" disabled={disabled || busy} onClick={() => { setMode(value); useUIStore.getState().setActiveTool("pen"); }}>{value === "pen" ? "Pen" : value === "eraser" ? "Stroke eraser" : "Highlighter"}</button>)}
          <label>Colour <input aria-label="Ink colour" type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
          <label>Width <input aria-label="Pen width" className="w-14 rounded border" type="number" min={1} max={20} value={width} onChange={e => setWidth(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
        </div>
        <div className="flex gap-3"><button disabled={busy} onClick={() => { session.current = null; setError(""); useCanvasStore.setState({ selectedNodeIds: [], nodes: useCanvasStore.getState().nodes.map(n => ({ ...n, selected: false })) }); useUIStore.getState().setActiveTool("pen"); }}>New handwriting</button><button onClick={() => useUIStore.getState().setActiveTool("select")}>Done writing</button><button disabled={busy || disabled} onClick={() => useCanvasStore.getState().undo()}>Undo</button></div>
        <div className="flex gap-2"><select aria-label="Handwriting language" disabled={busy} value={language} onChange={e => setLanguage(e.target.value)}><option value="mixed">English + Sanskrit</option><option value="en">English</option><option value="sa">Sanskrit</option></select><button disabled={!selected || disabled || busy} onClick={convert}>{busy ? `Converting… ${Math.round(progress * 100)}%` : "Convert to text"}</button>{busy && <button onClick={() => abort.current?.abort()}>Cancel</button>}</div>
        <p className="text-xs text-muted-foreground">Experimental local conversion: best with clear, separate characters. Cursive and Sanskrit may need substantial correction. Nothing is uploaded for recognition.</p>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  </>;
}
