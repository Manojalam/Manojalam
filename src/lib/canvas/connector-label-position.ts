export interface ConnectorPoint {
  x: number;
  y: number;
}

interface SampledSegment {
  start: ConnectorPoint;
  end: ConnectorPoint;
  length: number;
  distanceFromStart: number;
}

export interface SampledConnectorPath {
  segments: SampledSegment[];
  totalLength: number;
}

export interface ConnectorPathPosition {
  point: ConnectorPoint;
  progress: number;
}

const NUMBER_PATTERN = /[-+]?(?:\d*\.?\d+(?:e[-+]?\d+)?)/gi;
const TOKEN_PATTERN = /[a-zA-Z]|[-+]?(?:\d*\.?\d+(?:e[-+]?\d+)?)/gi;
const CURVE_STEPS = 32;

function distance(first: ConnectorPoint, second: ConnectorPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function interpolate(first: ConnectorPoint, second: ConnectorPoint, ratio: number): ConnectorPoint {
  return {
    x: first.x + (second.x - first.x) * ratio,
    y: first.y + (second.y - first.y) * ratio,
  };
}

function quadraticPoint(
  start: ConnectorPoint,
  control: ConnectorPoint,
  end: ConnectorPoint,
  ratio: number
): ConnectorPoint {
  const inverse = 1 - ratio;
  return {
    x: inverse * inverse * start.x + 2 * inverse * ratio * control.x + ratio * ratio * end.x,
    y: inverse * inverse * start.y + 2 * inverse * ratio * control.y + ratio * ratio * end.y,
  };
}

function cubicPoint(
  start: ConnectorPoint,
  firstControl: ConnectorPoint,
  secondControl: ConnectorPoint,
  end: ConnectorPoint,
  ratio: number
): ConnectorPoint {
  const inverse = 1 - ratio;
  return {
    x: inverse ** 3 * start.x
      + 3 * inverse * inverse * ratio * firstControl.x
      + 3 * inverse * ratio * ratio * secondControl.x
      + ratio ** 3 * end.x,
    y: inverse ** 3 * start.y
      + 3 * inverse * inverse * ratio * firstControl.y
      + 3 * inverse * ratio * ratio * secondControl.y
      + ratio ** 3 * end.y,
  };
}

function pathTokens(path: string): string[] {
  return path.match(TOKEN_PATTERN) ?? [];
}

function isCommand(token: string | undefined): boolean {
  return !!token && /^[a-zA-Z]$/.test(token);
}

/** Samples the SVG commands emitted by XYFlow and the orthogonal router. */
export function sampleConnectorPath(path: string): SampledConnectorPath {
  const tokens = pathTokens(path);
  const segments: SampledSegment[] = [];
  let index = 0;
  let command = "";
  let current = { x: 0, y: 0 };
  let subpathStart = { ...current };
  let totalLength = 0;

  const addPoint = (next: ConnectorPoint) => {
    const length = distance(current, next);
    if (length > 0.0001) {
      segments.push({
        start: { ...current },
        end: { ...next },
        length,
        distanceFromStart: totalLength,
      });
      totalLength += length;
    }
    current = { ...next };
  };
  const readNumber = (): number | null => {
    const token = tokens[index];
    if (token === undefined || isCommand(token) || !NUMBER_PATTERN.test(token)) {
      NUMBER_PATTERN.lastIndex = 0;
      return null;
    }
    NUMBER_PATTERN.lastIndex = 0;
    index += 1;
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };
  const readPoint = (relative: boolean): ConnectorPoint | null => {
    const x = readNumber();
    const y = readNumber();
    if (x === null || y === null) return null;
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper === "M") {
      const point = readPoint(relative);
      if (!point) break;
      current = point;
      subpathStart = { ...point };
      command = relative ? "l" : "L";
      continue;
    }
    if (upper === "L") {
      const point = readPoint(relative);
      if (!point) break;
      addPoint(point);
      continue;
    }
    if (upper === "H") {
      const x = readNumber();
      if (x === null) break;
      addPoint({ x: relative ? current.x + x : x, y: current.y });
      continue;
    }
    if (upper === "V") {
      const y = readNumber();
      if (y === null) break;
      addPoint({ x: current.x, y: relative ? current.y + y : y });
      continue;
    }
    if (upper === "Q") {
      const start = { ...current };
      const control = readPoint(relative);
      const end = readPoint(relative);
      if (!control || !end) break;
      for (let step = 1; step <= CURVE_STEPS; step += 1) {
        addPoint(quadraticPoint(start, control, end, step / CURVE_STEPS));
      }
      continue;
    }
    if (upper === "C") {
      const start = { ...current };
      const firstControl = readPoint(relative);
      const secondControl = readPoint(relative);
      const end = readPoint(relative);
      if (!firstControl || !secondControl || !end) break;
      for (let step = 1; step <= CURVE_STEPS; step += 1) {
        addPoint(cubicPoint(start, firstControl, secondControl, end, step / CURVE_STEPS));
      }
      continue;
    }
    if (upper === "Z") {
      addPoint(subpathStart);
      command = "";
      continue;
    }

    // Unsupported commands are not emitted by the canvas connector renderers.
    break;
  }

  return { segments, totalLength };
}

export function connectorPointAtProgress(
  path: SampledConnectorPath,
  progress: number,
  fallback: ConnectorPoint
): ConnectorPoint {
  if (!path.segments.length || path.totalLength <= 0) return { ...fallback };
  const normalized = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0.5));
  const targetDistance = path.totalLength * normalized;
  for (const segment of path.segments) {
    if (segment.distanceFromStart + segment.length < targetDistance) continue;
    return interpolate(
      segment.start,
      segment.end,
      segment.length ? (targetDistance - segment.distanceFromStart) / segment.length : 0
    );
  }
  return { ...path.segments[path.segments.length - 1].end };
}

export function closestConnectorPathPosition(
  path: SampledConnectorPath,
  point: ConnectorPoint,
  fallbackProgress = 0.5
): ConnectorPathPosition {
  if (!path.segments.length || path.totalLength <= 0) {
    return { point: { ...point }, progress: fallbackProgress };
  }
  let closestPoint = { ...path.segments[0].start };
  let closestProgress = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const segment of path.segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const squaredLength = dx * dx + dy * dy;
    const ratio = squaredLength
      ? Math.max(0, Math.min(1, (
          (point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy
        ) / squaredLength))
      : 0;
    const projected = interpolate(segment.start, segment.end, ratio);
    const squaredDistance = (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
    if (squaredDistance >= closestDistance) continue;
    closestDistance = squaredDistance;
    closestPoint = projected;
    closestProgress = (segment.distanceFromStart + segment.length * ratio) / path.totalLength;
  }

  return {
    point: closestPoint,
    progress: Math.max(0, Math.min(1, closestProgress)),
  };
}
