"use client";

import type {
  TextCalloutDirection,
  TextFrameStyle,
} from "@/lib/types";
import { speechBubblePath, textFrameBodyBox } from "@/lib/canvas/text-callout";

function thoughtDots(direction: TextCalloutDirection) {
  if (direction === "top") return [{ cx: 38, cy: 12, r: 6 }, { cx: 30, cy: 3, r: 3 }];
  if (direction === "right") return [{ cx: 88, cy: 38, r: 6 }, { cx: 97, cy: 30, r: 3 }];
  if (direction === "left") return [{ cx: 12, cy: 62, r: 6 }, { cx: 3, cy: 70, r: 3 }];
  return [{ cx: 62, cy: 88, r: 6 }, { cx: 70, cy: 97, r: 3 }];
}

interface TextCalloutSurfaceProps {
  style: Exclude<TextFrameStyle, "plain">;
  direction: TextCalloutDirection;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  selected?: boolean;
  filter?: string;
}

export function TextCalloutSurface({
  style,
  direction,
  fillColor,
  borderColor,
  borderWidth,
  borderStyle,
  selected,
  filter,
}: TextCalloutSurfaceProps) {
  const strokeDasharray = borderStyle === "dashed"
    ? `${Math.max(1, borderWidth) * 2.5} ${Math.max(1, borderWidth) * 1.5}`
    : borderStyle === "dotted" ? `0.1 ${Math.max(1, borderWidth) * 2}` : undefined;
  const outline = {
    fill: fillColor,
    stroke: borderWidth > 0 ? borderColor : "none",
    strokeWidth: Math.max(0, borderWidth),
    strokeDasharray,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  const selectionOutline = {
    fill: "none",
    stroke: "#4262ff",
    strokeWidth: 2,
    strokeDasharray: "4 3",
    vectorEffect: "non-scaling-stroke" as const,
  };
  const thoughtBody = textFrameBodyBox("thought", direction);
  const dots = thoughtDots(direction);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ filter }}
      data-text-frame-style={style}
      data-text-callout-direction={direction}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {style === "speech" ? (
          <>
            <path d={speechBubblePath(direction)} {...outline} />
            {selected && <path d={speechBubblePath(direction)} {...selectionOutline} />}
          </>
        ) : (
          <>
            <rect
              x={thoughtBody.x}
              y={thoughtBody.y}
              width={thoughtBody.width}
              height={thoughtBody.height}
              rx="14"
              {...outline}
            />
            {dots.map((dot, index) => (
              <circle key={index} {...dot} {...outline} />
            ))}
            {selected && (
              <rect
                x={thoughtBody.x}
                y={thoughtBody.y}
                width={thoughtBody.width}
                height={thoughtBody.height}
                rx="14"
                {...selectionOutline}
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}
