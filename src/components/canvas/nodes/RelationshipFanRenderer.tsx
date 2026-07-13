import type { CSSProperties } from "react";

import type { RelationshipFanLayout } from "@/lib/relationship-fan-layout";

const DEVANAGARI_FONT_FAMILY = [
  "var(--font-noto-devanagari)",
  "'Noto Sans Devanagari'",
  "'Nirmala UI'",
  "Mangal",
  "sans-serif",
].join(", ");

const DEFAULT_FONT_FAMILY = [
  "var(--font-geist-sans)",
  "Inter",
  "system-ui",
  "sans-serif",
].join(", ");

function containsDevanagari(value: string): boolean {
  return /[\u0900-\u097f]/u.test(value);
}

export interface RelationshipFanRendererProps {
  fans: readonly RelationshipFanLayout[];
  className?: string;
  layer?: "all" | "panels" | "badges";
  opacity?: number;
  fontFamily?: string;
  devanagariFontFamily?: string;
  fontWeight?: CSSProperties["fontWeight"];
  borderWidth?: number;
}

/**
 * Permanent SVG rendering only. Relationship-selection dimming, checks and
 * toolbars intentionally live elsewhere so exports can include this group as-is.
 */
export function RelationshipFanRenderer({
  fans,
  className,
  layer = "all",
  opacity = 1,
  fontFamily = DEFAULT_FONT_FAMILY,
  devanagariFontFamily = DEVANAGARI_FONT_FAMILY,
  fontWeight = 600,
  borderWidth = 1.25,
}: RelationshipFanRendererProps) {
  if (!fans.length) return null;

  return (
    <g
      className={className}
      data-sunburst-export="relationship-fans"
      pointerEvents="none"
      opacity={opacity}
    >
      {fans.map((fan) => (
        <g
          key={fan.id}
          data-relationship-fan={fan.id}
          data-source-node-id={fan.sourceNodeId}
          data-relation-type={fan.relationType}
          role="group"
          aria-label={`${fan.count} related ${fan.relationType} nodes`}
        >
          {layer !== "badges" && fan.visible && fan.attachmentPath && (
            <path
              d={fan.attachmentPath}
              fill={fan.attachmentFill}
              stroke={fan.attachmentStroke}
              strokeWidth={borderWidth}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {layer !== "badges" && fan.visible && fan.cells.map((cell) => (
            <g key={cell.targetNodeId} data-relationship-target-id={cell.targetNodeId}>
              <path
                d={cell.path}
                fill={cell.fill}
                stroke={cell.stroke}
                strokeWidth={borderWidth}
                vectorEffect="non-scaling-stroke"
              />
              <title>{cell.label}</title>
              {!cell.labelBox.hidden && (
                <text
                  x={cell.labelBox.x}
                  y={cell.labelBox.y}
                  transform={`rotate(${cell.labelBox.rotation} ${cell.labelBox.x} ${cell.labelBox.y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#0f172a"
                  fontFamily={containsDevanagari(cell.label) ? devanagariFontFamily : fontFamily}
                  fontSize={cell.labelBox.fontSize}
                  fontWeight={fontWeight}
                  style={{
                    fontKerning: "normal",
                    fontSynthesis: "style weight",
                    fontVariantLigatures: "common-ligatures contextual",
                    letterSpacing: "normal",
                    textRendering: "geometricPrecision",
                  }}
                >
                  {cell.label}
                </text>
              )}
            </g>
          ))}

          {layer !== "panels" && fan.countBadge && (
            <g data-relationship-count-badge={fan.sourceNodeId}>
              <circle
                cx={fan.countBadge.x}
                cy={fan.countBadge.y}
                r={fan.countBadge.radius}
                fill={fan.countBadge.fill}
                stroke={fan.countBadge.stroke}
                strokeWidth={Math.max(1.5, borderWidth)}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={fan.countBadge.x}
                y={fan.countBadge.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={fan.countBadge.textColor}
                fontFamily={fontFamily}
                fontSize={Math.max(9, fan.countBadge.radius * 0.94)}
                fontWeight={700}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fan.countBadge.count}
              </text>
            </g>
          )}
        </g>
      ))}
    </g>
  );
}
