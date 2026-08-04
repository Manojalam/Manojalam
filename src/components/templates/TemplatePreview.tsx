import type { CSSProperties } from "react";
import type { BoardContent, VidyaNode } from "@/lib/types";

type PreviewNode = {
  node: VidyaNode;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

function positiveDimension(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function fallbackSize(node: VidyaNode): { width: number; height: number } {
  switch (node.type) {
    case "frame": return { width: 280, height: 540 };
    case "shloka": return { width: 360, height: 190 };
    case "grammar": return { width: 300, height: 190 };
    case "sticky": return { width: 220, height: 120 };
    default: return { width: 180, height: 80 };
  }
}

function previewNode(node: VidyaNode): PreviewNode {
  const fallback = fallbackSize(node);
  const width = positiveDimension(node.style?.width, fallback.width);
  const height = positiveDimension(node.style?.height, fallback.height);
  return {
    node,
    x: node.position.x,
    y: node.position.y,
    width,
    height,
    centerX: node.position.x + width / 2,
    centerY: node.position.y + height / 2,
  };
}

function nodeLabel(node: VidyaNode): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const value = data.text ?? data.title ?? data.topic;
  if (typeof value !== "string") return "";
  return value.length > 22 ? `${value.slice(0, 21)}…` : value;
}

function nodeColor(node: VidyaNode): string {
  const color = (node.data as { color?: unknown } | undefined)?.color;
  return typeof color === "string" ? color : "#6366f1";
}

function NodeShape({ item, fontSize }: { item: PreviewNode; fontSize: number }) {
  const { node, x, y, width, height, centerX, centerY } = item;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const color = nodeColor(node);
  const shapeType = data.shapeType;
  const common = {
    fill: color,
    fillOpacity: node.type === "frame" ? 0.05 : 0.16,
    stroke: color,
    strokeWidth: node.type === "frame" ? 2 : 2.5,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <g>
      {shapeType === "diamond" ? (
        <polygon
          points={`${centerX},${y} ${x + width},${centerY} ${centerX},${y + height} ${x},${centerY}`}
          {...common}
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={node.type === "sticky" ? 8 : shapeType === "capsule" ? height / 2 : 14}
          strokeDasharray={node.type === "frame" ? "8 6" : undefined}
          {...common}
        />
      )}
      <text
        x={node.type === "frame" ? x + 18 : centerX}
        y={node.type === "frame" ? y + fontSize + 14 : centerY}
        textAnchor={node.type === "frame" ? "start" : "middle"}
        dominantBaseline="middle"
        className="fill-foreground font-medium"
        fontSize={fontSize}
      >
        {nodeLabel(node)}
      </text>
    </g>
  );
}

export function TemplatePreview({
  content,
  name,
}: {
  content: BoardContent;
  name: string;
}) {
  const nodes = content.nodes.filter((node) => !node.hidden).map(previewNode);
  const byId = new Map(nodes.map((item) => [item.node.id, item]));
  const padding = 55;
  const minX = Math.min(...nodes.map((item) => item.x), 0) - padding;
  const minY = Math.min(...nodes.map((item) => item.y), 0) - padding;
  const maxX = Math.max(...nodes.map((item) => item.x + item.width), 1) + padding;
  const maxY = Math.max(...nodes.map((item) => item.y + item.height), 1) + padding;
  const viewWidth = Math.max(1, maxX - minX);
  const viewHeight = Math.max(1, maxY - minY);
  const fontSize = Math.max(24, Math.min(42, viewWidth / 24));
  const style = { aspectRatio: `${viewWidth} / ${viewHeight}` } as CSSProperties;

  return (
    <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/25 p-2">
      <svg
        role="img"
        aria-label={`${name} preview`}
        viewBox={`${minX} ${minY} ${viewWidth} ${viewHeight}`}
        className="max-h-full w-full"
        style={style}
        preserveAspectRatio="xMidYMid meet"
      >
        {content.edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target || edge.hidden) return null;
          return (
            <line
              key={edge.id}
              x1={source.centerX}
              y1={source.centerY}
              x2={target.centerX}
              y2={target.centerY}
              stroke="#94a3b8"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {nodes.map((item) => (
          <NodeShape key={item.node.id} item={item} fontSize={fontSize} />
        ))}
      </svg>
    </div>
  );
}
