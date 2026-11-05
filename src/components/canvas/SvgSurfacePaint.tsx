"use client";

import type { CSSProperties, ReactNode } from "react";

/** Paint the same CSS layers inside an SVG outline; strokes remain independent. */
export function SvgSurfacePaint({ id, fill, paint, outline, bounds }: { id: string; fill?: string; paint?: CSSProperties; outline: ReactNode; bounds?: { x: number; y: number; width: number; height: number } }) {
  if (!paint?.backgroundImage) return null;
  return <>
    <defs><clipPath id={id}>{outline}</clipPath></defs>
    <foreignObject x={bounds?.x} y={bounds?.y} width={bounds?.width ?? "100%"} height={bounds?.height ?? "100%"} clipPath={`url(#${id})`}>
      <div style={{ width: "100%", height: "100%", backgroundColor: fill, ...paint, boxShadow: undefined }} />
    </foreignObject>
  </>;
}
