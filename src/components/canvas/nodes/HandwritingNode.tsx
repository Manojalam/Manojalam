"use client";
import { objectRotationStyle } from "@/lib/canvas/object-rotation";
import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";
import { inkRadius, type InkData, type InkStroke } from "@/lib/canvas/handwriting";
export function InkPaths({ strokes }: { strokes: InkStroke[] }) {
  return <>{strokes.map(s => <g key={s.id} opacity={s.highlighter ? 0.3 : 1} fill={s.color} stroke={s.color} strokeLinecap="round">
    {s.points.map((p, i) => i ? <line key={i} x1={s.points[i-1].x} y1={s.points[i-1].y} x2={p.x} y2={p.y} strokeWidth={inkRadius(s, p) * 2} /> : <circle key={i} cx={p.x} cy={p.y} r={inkRadius(s, p)} stroke="none" />)}
  </g>)}</>;
}
export const HandwritingNode = memo(function HandwritingNode({ data, selected }: NodeProps) {
  const ink = data.ink as InkData | undefined;
  const presentation = useUIStore(s => s.presentationMode);
  const viewer = useCanvasStore(s => s.board?.accessRole === "viewer");
  if (!ink) return null;
  return <div className="h-full w-full" style={{ ...objectRotationStyle("handwriting", data), outline: selected && !presentation && !viewer ? "1px solid #6366f1" : undefined }}>
    <svg aria-label="Handwriting" width="100%" height="100%" viewBox={`0 0 ${ink.width} ${ink.height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}><InkPaths strokes={ink.strokes} /></svg>
  </div>;
});
