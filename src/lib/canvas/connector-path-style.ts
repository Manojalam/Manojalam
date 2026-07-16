import type { ConnectorPathStyle, VidyaEdgeData } from "../types";

export const CONNECTOR_PATH_STYLES: ReadonlyArray<{
  value: ConnectorPathStyle;
  label: string;
}> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
];

const PATH_STYLE_VALUES = new Set<ConnectorPathStyle>(
  CONNECTOR_PATH_STYLES.map(({ value }) => value)
);

export function resolveConnectorPathStyle(data: VidyaEdgeData): ConnectorPathStyle {
  if (PATH_STYLE_VALUES.has(data.pathStyle as ConnectorPathStyle)) {
    return data.pathStyle as ConnectorPathStyle;
  }
  return data.dashed ? "dashed" : "solid";
}

export function connectorStrokeDasharray(style: ConnectorPathStyle): string | undefined {
  if (style === "dashed") return "8 5";
  if (style === "dotted") return "1 5";
  return undefined;
}

export function doubleConnectorStrokeWidths(width: number): {
  outer: number;
  separator: number;
} {
  const railWidth = Math.max(1, Number.isFinite(width) ? width : 2);
  return {
    outer: railWidth * 2 + 2,
    separator: Math.max(1.5, railWidth),
  };
}
