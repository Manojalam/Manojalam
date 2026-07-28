import { matrixCellBorderRadius } from "../layout/matrix-presentation";
import type { ShapeType } from "../types";
import { resolveNodeBorderRadius } from "../style-utils";
import { resolveObjectRotation } from "./object-rotation";

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

export type ShapeConnectionOptions = {
  width?: number;
  height?: number;
  borderRadius?: number;
  petalCount?: number;
  rotation?: number;
};

type ShapeContour = ShapeConnectionPoint[];
type IntersectionStrategy = "nearest" | "farthest";
type ShapeOutlineKind =
  | "box"
  | "rounded"
  | "ellipse"
  | "capsule"
  | "polygon"
  | "path"
  | "predefined-process"
  | "flower";

const SHAPE_OUTLINE_KINDS = {
  rectangle: "box",
  rounded: "rounded",
  circle: "ellipse",
  ellipse: "ellipse",
  diamond: "polygon",
  capsule: "capsule",
  callout: "polygon",
  triangle: "polygon",
  hexagon: "polygon",
  star: "polygon",
  arrow: "polygon",
  parallelogram: "polygon",
  trapezoid: "polygon",
  document: "path",
  database: "path",
  predefinedProcess: "predefined-process",
  delay: "path",
  cloud: "path",
  offPageConnector: "polygon",
  flower: "flower",
  leaf: "path",
} as const satisfies Record<ShapeType, ShapeOutlineKind>;

const SHAPE_POLYGON_VERTICES: Readonly<
  Partial<Record<ShapeType, readonly ShapeConnectionPoint[]>>
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

/** SVG polygon data shared by the visible shape and all connection geometry. */
export const SHAPE_POLYGON_POINTS = Object.fromEntries(
  Object.entries(SHAPE_POLYGON_VERTICES).map(([shapeType, points]) => [
    shapeType,
    points?.map((point) => `${point.x},${point.y}`).join(" "),
  ])
) as Partial<Record<ShapeType, string>>;

/** CSS clips use the exact same polygon vertices as the visible SVG surface. */
export const SHAPE_POLYGON_CLIP_PATHS = Object.fromEntries(
  Object.entries(SHAPE_POLYGON_VERTICES).map(([shapeType, points]) => [
    shapeType,
    `polygon(${points?.map((point) => `${point.x}% ${point.y}%`).join(", ")})`,
  ])
) as Partial<Record<ShapeType, string>>;

/** Custom SVG paths shared by rendering and silhouette intersection. */
export const SHAPE_SVG_PATHS: Readonly<Partial<Record<ShapeType, string>>> = {
  document: "M6 5 H94 V76 C76 66 66 94 46 83 C28 72 18 92 6 80 Z",
  database: "M10 22 C10 8 90 8 90 22 V78 C90 92 10 92 10 78 Z",
  delay: "M8 5 H55 C80 5 96 25 96 50 C96 75 80 95 55 95 H8 Z",
  cloud: "M30 80 H78 C91 80 98 70 94 58 C99 47 91 35 78 36 C73 21 55 15 43 25 C33 18 18 24 17 39 C7 43 2 52 5 64 C8 75 17 80 30 80 Z",
  leaf: "M50 3 C87 18 98 51 50 97 C2 51 13 18 50 3 Z",
};

export const PREDEFINED_PROCESS_SHAPE = {
  x: 4,
  y: 4,
  width: 92,
  height: 92,
  radius: 6,
} as const;

export const FLOWER_SHAPE = {
  centerX: 50,
  centerY: 50,
  petalCenterY: 29,
  petalRadiusX: 15,
  petalRadiusY: 28,
  centerRadius: 15,
} as const;

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

const INTERSECTION_EPSILON = 0.000001;
const CURVE_SAMPLES = 32;
const ELLIPSE_SAMPLES = 96;

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function cross(first: ShapeConnectionPoint, second: ShapeConnectionPoint): number {
  return first.x * second.y - first.y * second.x;
}

function pointsEqual(first: ShapeConnectionPoint, second: ShapeConnectionPoint): boolean {
  return Math.abs(first.x - second.x) <= INTERSECTION_EPSILON
    && Math.abs(first.y - second.y) <= INTERSECTION_EPSILON;
}

function cubicPoint(
  start: ShapeConnectionPoint,
  control1: ShapeConnectionPoint,
  control2: ShapeConnectionPoint,
  end: ShapeConnectionPoint,
  progress: number
): ShapeConnectionPoint {
  const remaining = 1 - progress;
  return {
    x: remaining ** 3 * start.x
      + 3 * remaining ** 2 * progress * control1.x
      + 3 * remaining * progress ** 2 * control2.x
      + progress ** 3 * end.x,
    y: remaining ** 3 * start.y
      + 3 * remaining ** 2 * progress * control1.y
      + 3 * remaining * progress ** 2 * control2.y
      + progress ** 3 * end.y,
  };
}

/** Parse the small absolute SVG path subset used by the authored shape library. */
function sampleSvgPath(path: string): ShapeContour {
  const tokens = path.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const points: ShapeContour = [];
  let cursor = 0;
  let command = "";
  let current = { x: 0, y: 0 };
  let start = current;
  const number = () => Number(tokens[cursor++]);
  const append = (point: ShapeConnectionPoint) => {
    if (!points.length || !pointsEqual(points[points.length - 1], point)) points.push(point);
    current = point;
  };

  while (cursor < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[cursor])) command = tokens[cursor++];
    switch (command) {
      case "M": {
        const point = { x: number(), y: number() };
        append(point);
        start = point;
        command = "L";
        break;
      }
      case "L":
        append({ x: number(), y: number() });
        break;
      case "H":
        append({ x: number(), y: current.y });
        break;
      case "V":
        append({ x: current.x, y: number() });
        break;
      case "C": {
        const control1 = { x: number(), y: number() };
        const control2 = { x: number(), y: number() };
        const end = { x: number(), y: number() };
        const segmentStart = current;
        for (let sample = 1; sample <= CURVE_SAMPLES; sample += 1) {
          append(cubicPoint(
            segmentStart,
            control1,
            control2,
            end,
            sample / CURVE_SAMPLES
          ));
        }
        break;
      }
      case "Z":
      case "z":
        append(start);
        command = "";
        break;
      default:
        throw new Error(`Unsupported shape path command: ${command}`);
    }
  }
  return points;
}

const SHAPE_PATH_CONTOURS = Object.fromEntries(
  Object.entries(SHAPE_SVG_PATHS).map(([shapeType, path]) => [
    shapeType,
    sampleSvgPath(path),
  ])
) as Partial<Record<ShapeType, ShapeContour>>;

function ellipseContour(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  samples = ELLIPSE_SAMPLES
): ShapeContour {
  return Array.from({ length: samples }, (_, index) => {
    const angle = index / samples * Math.PI * 2;
    return {
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
    };
  });
}

function roundedRectContour(
  x: number,
  y: number,
  width: number,
  height: number,
  radiusX: number,
  radiusY = radiusX
): ShapeContour {
  const rx = Math.max(0, Math.min(Math.abs(radiusX), width / 2));
  const ry = Math.max(0, Math.min(Math.abs(radiusY), height / 2));
  if (rx <= INTERSECTION_EPSILON || ry <= INTERSECTION_EPSILON) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }

  const points: ShapeContour = [];
  const corner = (
    centerX: number,
    centerY: number,
    startAngle: number
  ) => {
    for (let sample = 0; sample <= 12; sample += 1) {
      const angle = (startAngle + sample / 12 * 90) * Math.PI / 180;
      points.push({
        x: centerX + rx * Math.cos(angle),
        y: centerY + ry * Math.sin(angle),
      });
    }
  };
  corner(x + width - rx, y + ry, -90);
  corner(x + width - rx, y + height - ry, 0);
  corner(x + rx, y + height - ry, 90);
  corner(x + rx, y + ry, 180);
  return points;
}

export function normalizeShapePetalCount(value: unknown): number {
  return Math.max(4, Math.min(16, Math.round(typeof value === "number" ? value : 8)));
}

function rotatePoint(
  point: ShapeConnectionPoint,
  center: ShapeConnectionPoint,
  degrees: number
): ShapeConnectionPoint {
  if (!degrees) return point;
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine,
  };
}

function normalizedContourToPixels(
  contour: readonly ShapeConnectionPoint[],
  width: number,
  height: number
): ShapeContour {
  return contour.map((point) => ({
    x: point.x / 100 * width,
    y: point.y / 100 * height,
  }));
}

function flowerContours(width: number, height: number, petalCount: number): ShapeContour[] {
  const petals = Array.from({ length: petalCount }, (_, index) => {
    const angle = 360 / petalCount * index;
    const normalized = ellipseContour(
      FLOWER_SHAPE.centerX,
      FLOWER_SHAPE.petalCenterY,
      FLOWER_SHAPE.petalRadiusX,
      FLOWER_SHAPE.petalRadiusY,
      64
    ).map((point) => rotatePoint(
      point,
      { x: FLOWER_SHAPE.centerX, y: FLOWER_SHAPE.centerY },
      angle
    ));
    return normalizedContourToPixels(normalized, width, height);
  });
  return [
    ...petals,
    normalizedContourToPixels(ellipseContour(
      FLOWER_SHAPE.centerX,
      FLOWER_SHAPE.centerY,
      FLOWER_SHAPE.centerRadius,
      FLOWER_SHAPE.centerRadius,
      64
    ), width, height),
  ];
}

function shapeContours(
  shapeType: string | undefined,
  width: number,
  height: number,
  options: ShapeConnectionOptions
): { contours: ShapeContour[]; strategy: IntersectionStrategy } {
  const kind = SHAPE_OUTLINE_KINDS[shapeType as ShapeType] ?? "box";
  if (kind === "polygon") {
    const polygon = SHAPE_POLYGON_VERTICES[shapeType as ShapeType]!;
    return {
      contours: [normalizedContourToPixels(polygon, width, height)],
      strategy: "nearest",
    };
  }

  if (kind === "path") {
    const pathContour = SHAPE_PATH_CONTOURS[shapeType as ShapeType]!;
    return {
      contours: [normalizedContourToPixels(pathContour, width, height)],
      strategy: "nearest",
    };
  }

  if (kind === "predefined-process") {
    return {
      contours: [roundedRectContour(
        width * PREDEFINED_PROCESS_SHAPE.x / 100,
        height * PREDEFINED_PROCESS_SHAPE.y / 100,
        width * PREDEFINED_PROCESS_SHAPE.width / 100,
        height * PREDEFINED_PROCESS_SHAPE.height / 100,
        width * PREDEFINED_PROCESS_SHAPE.radius / 100,
        height * PREDEFINED_PROCESS_SHAPE.radius / 100
      )],
      strategy: "nearest",
    };
  }

  if (kind === "flower") {
    return {
      contours: flowerContours(width, height, normalizeShapePetalCount(options.petalCount)),
      strategy: "farthest",
    };
  }

  if (kind === "ellipse") {
    return {
      contours: [ellipseContour(width / 2, height / 2, width / 2, height / 2)],
      strategy: "nearest",
    };
  }

  const radius = kind === "capsule"
    ? Math.min(width, height) / 2
    : kind === "rounded" ? Math.max(0, options.borderRadius ?? 0) : 0;
  return {
    contours: [roundedRectContour(0, 0, width, height, radius)],
    strategy: "nearest",
  };
}

function contourConnectionPoint(
  contours: readonly ShapeContour[],
  center: ShapeConnectionPoint,
  side: ConnectionSide,
  strategy: IntersectionStrategy
): ShapeConnectionPoint | null {
  const direction = SIDE_DIRECTIONS[side];
  let selected: { distance: number; point: ShapeConnectionPoint } | null = null;

  for (const points of contours) {
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const segment = { x: end.x - start.x, y: end.y - start.y };
      const denominator = cross(direction, segment);
      if (Math.abs(denominator) <= INTERSECTION_EPSILON) continue;

      const fromCenter = {
        x: start.x - center.x,
        y: start.y - center.y,
      };
      const distance = cross(fromCenter, segment) / denominator;
      const segmentProgress = cross(fromCenter, direction) / denominator;
      if (
        distance < -INTERSECTION_EPSILON
        || segmentProgress < -INTERSECTION_EPSILON
        || segmentProgress > 1 + INTERSECTION_EPSILON
      ) continue;

      const preferred = !selected
        || (strategy === "nearest"
          ? distance < selected.distance
          : distance > selected.distance);
      if (preferred) {
        selected = {
          distance,
          point: {
            x: center.x + direction.x * distance,
            y: center.y + direction.y * distance,
          },
        };
      }
    }
  }

  return selected?.point ?? null;
}

export function isSvgShapeType(shapeType: string): boolean {
  const kind = SHAPE_OUTLINE_KINDS[shapeType as ShapeType];
  return kind === "polygon"
    || kind === "path"
    || kind === "predefined-process"
    || kind === "flower";
}

/**
 * Return the cardinal-ray intersection with the actual rendered silhouette.
 * Every connector renderer and every authored shape uses this one contract.
 */
export function shapeConnectionPoint(
  shapeType: string | undefined,
  side: ConnectionSide,
  options: ShapeConnectionOptions = {}
): ShapeConnectionPoint {
  const width = finitePositive(options.width, 100);
  const height = finitePositive(options.height, 100);
  const center = { x: width / 2, y: height / 2 };
  const outline = shapeContours(shapeType, width, height, options);
  const rotation = typeof options.rotation === "number" && Number.isFinite(options.rotation)
    ? options.rotation
    : 0;
  const rotatedContours = rotation
    ? outline.contours.map((contour) =>
        contour.map((point) => rotatePoint(point, center, rotation))
      )
    : outline.contours;
  const point = contourConnectionPoint(
    rotatedContours,
    center,
    side,
    outline.strategy
  );
  if (!point) return DEFAULT_CONNECTION_POINTS[side];
  return {
    x: point.x / width * 100,
    y: point.y / height * 100,
  };
}

function nodeShapeConnectionOptions(
  node: ShapeConnectionNode,
  rect: ShapeConnectionRect,
  shapeType: string
): ShapeConnectionOptions {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const size = {
    width: finitePositive(rect.width, 100),
    height: finitePositive(rect.height, 100),
  };
  const matrixCell = data.matrixCell === true;
  const borderRadius = shapeType === "capsule"
    ? Math.min(size.width, size.height) / 2
    : matrixCell && shapeType === "rounded"
      ? matrixCellBorderRadius(
          typeof data.matrixCellRole === "string" ? data.matrixCellRole : undefined
        )
      : resolveNodeBorderRadius(
          data,
          size,
          shapeType === "rectangle" ? 0 : 40
        );
  return {
    ...size,
    borderRadius,
    petalCount: data.petalCount as number | undefined,
    rotation: resolveObjectRotation(node.type, data),
  };
}

/** Resolve a node's visible authored-shape outline point in canvas coordinates. */
export function nodeShapeConnectionPoint(
  node: ShapeConnectionNode,
  rect: ShapeConnectionRect,
  side: ConnectionSide
): ShapeConnectionPoint {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const shapeType = node.type === "shape"
    ? typeof data.shapeType === "string" ? data.shapeType : "rounded"
    : "rectangle";
  const normalized = shapeConnectionPoint(
    shapeType,
    side,
    nodeShapeConnectionOptions(node, rect, shapeType)
  );
  return {
    x: rect.x + rect.width * normalized.x / 100,
    y: rect.y + rect.height * normalized.y / 100,
  };
}
