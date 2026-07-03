"use client";

/**
 * BorderLayers
 *
 * Renders extra border layers as concentric absolutely-positioned divs that
 * expand OUTWARD from the node, following its corner radius. Unlike box-shadow,
 * this supports solid/dashed/dotted styles and is never clipped by the shape
 * (the host node must NOT set overflow:hidden on the bordered element).
 */

import type { BorderLayer } from "@/lib/types";
import { computeBorderLayerBoxes } from "@/lib/style-utils";

interface BorderLayersProps {
  layers: BorderLayer[];
  primaryWidth: number;
  baseRadius: number;
}

export function BorderLayers({ layers, primaryWidth, baseRadius }: BorderLayersProps) {
  if (!layers?.length) return null;
  const boxes = computeBorderLayerBoxes(primaryWidth, baseRadius, layers);
  return (
    <>
      {boxes.map((b) => (
        <div
          key={b.id}
          className="pointer-events-none absolute"
          style={{
            inset: b.inset,
            border: `${b.width}px ${b.style} ${b.color}`,
            borderRadius: b.radius || undefined,
          }}
        />
      ))}
    </>
  );
}
