export interface ChartNodeSize {
  width: number;
  height: number;
}

export interface ChartNodeResize {
  size: ChartNodeSize;
  dataPatch: Record<string, unknown>;
}

export const RELATIONSHIP_DIAGRAM_MIN_WIDTH = 420;
export const RELATIONSHIP_DIAGRAM_MIN_HEIGHT = 360;
export const CHART_NODE_MAX_SIZE = 4096;
export const SUNBURST_MIN_SIZE = 420;

function boundedDimension(value: number, minimum: number, maximum: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : minimum;
  return Math.max(minimum, Math.min(maximum, rounded));
}

/**
 * Resolve the authored size and persisted data that belong together for chart
 * nodes. Keeping this pure makes inspector edits and direct React Flow resize
 * gestures follow the same rules.
 */
export function resolveChartNodeResize(
  nodeType: string | undefined,
  requested: ChartNodeSize
): ChartNodeResize | null {
  if (nodeType === "relationshipDiagram") {
    const size = {
      width: boundedDimension(
        requested.width,
        RELATIONSHIP_DIAGRAM_MIN_WIDTH,
        CHART_NODE_MAX_SIZE
      ),
      height: boundedDimension(
        requested.height,
        RELATIONSHIP_DIAGRAM_MIN_HEIGHT,
        CHART_NODE_MAX_SIZE
      ),
    };
    return {
      size,
      dataPatch: {
        autoSizeMode: "fixed",
        userSize: size,
      },
    };
  }

  if (nodeType === "sunburst") {
    const side = boundedDimension(
      Math.max(requested.width, requested.height),
      SUNBURST_MIN_SIZE,
      CHART_NODE_MAX_SIZE
    );
    return {
      size: { width: side, height: side },
      dataPatch: {
        chartSize: side,
        chartSizeManual: true,
      },
    };
  }

  return null;
}
