export type ConnectionSide = "top" | "right" | "bottom" | "left";

export type ShapeConnectionPoint = {
  x: number;
  y: number;
};

export type ShapeConnectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ShapeConnectionNode = {
  type?: string;
  data?: unknown;
};

const SHAPE_POLYGON_VERTICES: Readonly<
  Partial<Record<string, readonly ShapeConnectionPoint[]>>
> = {
  diamond: [
    { x: 50, y: 1 },
    { x: 99, y: 50 },
    { x: 50, y: 99 },
    { x: 1, y: 50 },
  ],
  triangle: [
    { x: 50, y: 1 },
    { x: 1, y: 99 },
    { x: 99, y: 99 },
  ],
  hexagon: [
    { x: 25, y: 1 },
    { x: 75, y: 1 },
    { x: 99, y: 50 },
    { x: 75, y: 99 },
    { x: 25, y: 99 },
    { x: 1, y: 50 },
  ],
  star: [
    { x: 50, y: 1 },
    { x: 61, y: 35 },
    { x: 98, y: 35 },
    { x: 68, y: 57 },
    { x: 79, y: 91 },
    { x: 50, y: 70 },
    { x: 21, y: 91 },
    { x: 32, y: 57 },
    { x: 2, y: 35 },
    { x: 39, y: 35 },
  ],
  arrow: [
    { x: 1, y: 25 },
    { x: 60, y: 25 },
    { x: 60, y: 1 },
    { x: 99, y: 50 },
    { x: 60, y: 99 },
    { x: 60, y: 75 },
    { x: 1, y: 75 },
  ],
  parallelogram: [
    { x: 16, y: 1 },
    { x: 99, y: 1 },
    { x: 84, y: 99 },
    { x: 1, y: 99 },
  ],
  trapezoid: [
    { x: 18, y: 1 },
    { x: 82, y: 1 },
    { x: 99, y: 99 },
    { x: 1, y: 99 },
  ],
  offPageConnector: [
    { x: 1, y: 1 },
    { x: 99, y: 1 },
    { x: 99, y: 76 },
    { x: 50, y: 99 },
    { x: 1, y: 76 },
  ],
  callout: [
    { x: 1, y: 1 },
    { x: 99, y: 1 },
    { x: 99, y: 78 },
    { x: 64, y: 78 },
    { x: 50, y: 99 },
    { x: 38, y: 78 },
    { x: 1, y: 78 },
  ],
};

/** SVG polygon data shared by the visible shape and its connection geometry. */
export const SHAPE_POLYGON_POINTS = Object.fromEntries(
  Object.entries(SHAPE_POLYGON_VERTICES).map(([shapeType, points]) => [
    shapeType,
    points?.map((point) => `${point.x},${point.y}`).join(" "),
  ])
) as Partial<Record<string, string>>;

const DEFAULT_CONNECTION_POINTS: Record<ConnectionSide, ShapeConnectionPoint> = {
  top: { x: 50, y: 0 },
  right: { x: 100, y: 50 },
  bottom: { x: 50, y: 100 },
  left: { x: 0, y: 50 },
};

const SIDE_DIRECTIONS: Record<ConnectionSide, ShapeConnectionPoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const SHAPE_CENTER = { x: 50, y: 50 };
const INTERSECTION_EPSILON = 0.000001;

function cross(first: ShapeConnectionPoint, second: ShapeConnectionPoint): number {
  return first.x * second.y - first.y * second.x;
}

/**
 * Finds the first polygon boundary hit by a cardinal ray leaving the shape
 * center. Concave silhouettes such as stars therefore attach at the visible
 * notch instead of the surrounding node rectangle.
 */
function polygonConnectionPoint(
  points: readonly ShapeConnectionPoint[],
  side: ConnectionSide
): ShapeConnectionPoint | null {
  const direction = SIDE_DIRECTIONS[side];
  let closest: { distance: number; point: ShapeConnectionPoint } | null = null;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const segment = { x: end.x - start.x, y: end.y - start.y };
    const denominator = cross(direction, segment);
    if (Math.abs(denominator) <= INTERSECTION_EPSILON) continue;

    const fromCenter = {
      x: start.x - SHAPE_CENTER.x,
      y: start.y - SHAPE_CENTER.y,
    };
    const distance = cross(fromCenter, segment) / denominator;
    const segmentProgress = cross(fromCenter, direction) / denominator;
    if (
      distance < -INTERSECTION_EPSILON
      || segmentProgress < -INTERSECTION_EPSILON
      || segmentProgress > 1 + INTERSECTION_EPSILON
    ) continue;

    if (!closest || distance < closest.distance) {
      closest = {
        distance,
        point: {
          x: SHAPE_CENTER.x + direction.x * distance,
          y: SHAPE_CENTER.y + direction.y * distance,
        },
      };
    }
  }

  return closest?.point ?? null;
}

/**
 * Returns percentages within the node bounds for a stable side handle.
 * Rectangular and curved shapes keep React Flow's normal box-side positions.
 */
export function shapeConnectionPoint(
  shapeType: string | undefined,
  side: ConnectionSide
): ShapeConnectionPoint {
  const polygon = shapeType ? SHAPE_POLYGON_VERTICES[shapeType] : undefined;
  const point = polygon ? polygonConnectionPoint(polygon, side) : null;
  return point ?? DEFAULT_CONNECTION_POINTS[side];
}

export function polygonShapeConnectionPointOnRect(
  shapeType: string | undefined,
  rect: ShapeConnectionRect,
  side: ConnectionSide
): ShapeConnectionPoint | null {
  if (!shapeType || !SHAPE_POLYGON_VERTICES[shapeType]) return null;
  const normalized = shapeConnectionPoint(shapeType, side);
  return {
    x: rect.x + rect.width * normalized.x / 100,
    y: rect.y + rect.height * normalized.y / 100,
  };
}

/** Resolve the visible authored-shape outline point in canvas coordinates. */
export function nodeShapeConnectionPoint(
  node: ShapeConnectionNode,
  rect: ShapeConnectionRect,
  side: ConnectionSide
): ShapeConnectionPoint {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const shapeType = node.type === "shape"
    ? typeof data.shapeType === "string" ? data.shapeType : "rounded"
    : undefined;
  const normalized = shapeConnectionPoint(shapeType, side);
  return {
    x: rect.x + rect.width * normalized.x / 100,
    y: rect.y + rect.height * normalized.y / 100,
  };
}

/** Return an outline point only when the node uses a polygon silhouette. */
export function nodePolygonConnectionPoint(
  node: ShapeConnectionNode,
  rect: ShapeConnectionRect,
  side: ConnectionSide
): ShapeConnectionPoint | null {
  if (node.type !== "shape") return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const shapeType = typeof data.shapeType === "string" ? data.shapeType : "rounded";
  return polygonShapeConnectionPointOnRect(shapeType, rect, side);
}
