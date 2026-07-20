import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRect, type NodeRect } from "./geometry";
import {
  EDGE_OBSTACLE_PADDING,
  routeLayoutEdge,
  routeManualOrthogonalEdge,
  routeOrthogonalEdge,
  routeRectilinearEdge,
} from "./edge-routing";

function segmentIntersectsRect(
  first: { x: number; y: number },
  second: { x: number; y: number },
  rect: NodeRect
): boolean {
  const left = rect.left - EDGE_OBSTACLE_PADDING;
  const right = rect.right + EDGE_OBSTACLE_PADDING;
  const top = rect.top - EDGE_OBSTACLE_PADDING;
  const bottom = rect.bottom + EDGE_OBSTACLE_PADDING;
  if (first.x === second.x) {
    return first.x > left && first.x < right
      && Math.max(first.y, second.y) > top
      && Math.min(first.y, second.y) < bottom;
  }
  return first.y > top && first.y < bottom
    && Math.max(first.x, second.x) > left
    && Math.min(first.x, second.x) < right;
}

function assertAvoids(route: ReturnType<typeof routeLayoutEdge>, obstacle: NodeRect): void {
  for (let index = 0; index < route.points.length - 1; index++) {
    assert.equal(segmentIntersectsRect(route.points[index], route.points[index + 1], obstacle), false);
  }
}

function routeContainsPoint(
  points: Array<{ x: number; y: number }>,
  target: { x: number; y: number }
): boolean {
  return points.slice(0, -1).some((first, index) => {
    const second = points[index + 1];
    if (first.x === second.x && target.x === first.x) {
      return target.y >= Math.min(first.y, second.y) && target.y <= Math.max(first.y, second.y);
    }
    if (first.y === second.y && target.y === first.y) {
      return target.x >= Math.min(first.x, second.x) && target.x <= Math.max(first.x, second.x);
    }
    return false;
  });
}

test("structured sibling routes use distinct ordered ports and lanes", () => {
  const source = createNodeRect("source", 0, 120, 200, 100);
  const firstTarget = createNodeRect("first", 360, 0, 180, 70);
  const secondTarget = createNodeRect("second", 360, 240, 180, 70);
  const first = routeLayoutEdge(source, firstTarget, "horizontal", [], {
    sourceFraction: 0.2,
    targetFraction: 0.5,
    laneOffset: -18,
  });
  const second = routeLayoutEdge(source, secondTarget, "horizontal", [], {
    sourceFraction: 0.8,
    targetFraction: 0.5,
    laneOffset: 18,
  });

  assert.notEqual(first.points[0].y, second.points[0].y, "siblings need distinct source ports");
  assert.notEqual(first.points[1].x, second.points[1].x, "siblings need distinct routing lanes");
});

test("near-aligned automatic routes collapse micro-doglegs into one segment", () => {
  const horizontal = routeLayoutEdge(
    createNodeRect("source", 0, 100, 120, 80),
    createNodeRect("target", 320, 108, 120, 80),
    "horizontal",
    []
  );
  const vertical = routeLayoutEdge(
    createNodeRect("source", 100, 0, 120, 80),
    createNodeRect("target", 110, 260, 120, 80),
    "vertical",
    []
  );

  assert.equal(horizontal.points.length, 2);
  assert.equal(vertical.points.length, 2);
  assert.equal(horizontal.path.includes("Q"), false);
  assert.equal(vertical.path.includes("Q"), false);
});

test("a direct near-aligned route still detours around obstacles", () => {
  const source = createNodeRect("source", 0, 100, 120, 80);
  const target = createNodeRect("target", 420, 108, 120, 80);
  const obstacle = createNodeRect("obstacle", 230, 80, 100, 120);
  const route = routeLayoutEdge(source, target, "horizontal", [obstacle]);

  assert.ok(route.points.length > 2);
  assertAvoids(route, obstacle);
});

test("orthogonal routes detour around intervening boxes", () => {
  const source = createNodeRect("source", 0, 80, 160, 80);
  const target = createNodeRect("target", 520, 80, 160, 80);
  const obstacle = createNodeRect("obstacle", 260, 40, 160, 160);
  const route = routeRectilinearEdge(source, target, [obstacle]);

  assert.ok(route.points.length >= 5);
  assertAvoids(route, obstacle);
});

test("manual bend anchors keep every connector segment orthogonal", () => {
  const route = routeManualOrthogonalEdge(
    { x: 100, y: 100 },
    { x: 600, y: 280 },
    "right",
    "left",
    [{ x: 260, y: 40 }, { x: 430, y: 360 }]
  );

  assert.ok(routeContainsPoint(route.points, { x: 260, y: 40 }));
  assert.ok(routeContainsPoint(route.points, { x: 430, y: 360 }));
  for (let index = 0; index < route.points.length - 1; index++) {
    const first = route.points[index];
    const second = route.points[index + 1];
    assert.ok(first.x === second.x || first.y === second.y, "manual segments must stay orthogonal");
  }
});

test("manual bend routes preserve clean handle stubs", () => {
  const route = routeManualOrthogonalEdge(
    { x: 100, y: 100 },
    { x: 400, y: 300 },
    "bottom",
    "top",
    [{ x: 260, y: 180 }]
  );

  assert.equal(route.points[1].x, 100);
  assert.ok(route.points[1].y > 100);
  const beforeTarget = route.points[route.points.length - 2];
  assert.equal(beforeTarget.x, 400);
  assert.ok(beforeTarget.y < 300);
});

test("a collinear waypoint does not change the direction used by later bends", () => {
  const source = { x: 100, y: 100 };
  const target = { x: 600, y: 280 };
  const original = routeManualOrthogonalEdge(
    source,
    target,
    "right",
    "left",
    [{ x: 430, y: 40 }]
  );
  const withNeutralWaypoint = routeManualOrthogonalEdge(
    source,
    target,
    "right",
    "left",
    [{ x: 265, y: 100 }, { x: 430, y: 40 }]
  );

  assert.deepEqual(withNeutralWaypoint.points, original.points);
});

test("outer-lane routes do not turn small endpoint-center drift into visible knots", () => {
  const route = routeManualOrthogonalEdge(
    { x: 200, y: 40 },
    { x: 180, y: 254 },
    "right",
    "right",
    [
      { x: 412, y: 46 },
      { x: 412, y: 260 },
    ]
  );

  assert.deepEqual(route.points, [
    { x: 200, y: 40 },
    { x: 412, y: 40 },
    { x: 412, y: 254 },
    { x: 180, y: 254 },
  ]);
});

test("manual routes retain deliberate endpoint offsets outside the knot tolerance", () => {
  const route = routeManualOrthogonalEdge(
    { x: 200, y: 40 },
    { x: 180, y: 254 },
    "right",
    "right",
    [
      { x: 412, y: 52 },
      { x: 412, y: 242 },
    ]
  );

  assert.ok(route.points.some((point) => point.y === 242));
});

test("junction endpoint routes do not retain tiny redundant stub bends", () => {
  const route = routeOrthogonalEdge(
    { x: 0, y: 0 },
    { x: 300, y: 120 },
    "right",
    "top",
    [],
    [],
    { sourceStubDistance: 0 }
  );

  for (let index = 1; index < route.points.length - 1; index++) {
    const previous = route.points[index - 1];
    const point = route.points[index];
    const next = route.points[index + 1];
    assert.equal(
      (previous.x === point.x && point.x === next.x)
        || (previous.y === point.y && point.y === next.y),
      false,
      "the simplified junction route should contain only real turns"
    );
  }
});

test("nearly aligned facing ports render as one straight segment", () => {
  const vertical = routeOrthogonalEdge(
    { x: 100, y: 80 },
    { x: 104, y: 260 },
    "bottom",
    "top",
    []
  );
  const horizontal = routeOrthogonalEdge(
    { x: 80, y: 100 },
    { x: 260, y: 105 },
    "right",
    "left",
    []
  );

  assert.equal(vertical.points.length, 2);
  assert.equal(horizontal.points.length, 2);
  assert.equal(vertical.path.includes("Q"), false);
  assert.equal(horizontal.path.includes("Q"), false);
});

test("perpendicular ports use one clean elbow when the route is unobstructed", () => {
  const route = routeOrthogonalEdge(
    { x: 390, y: 230 },
    { x: 230, y: 350 },
    "bottom",
    "right",
    []
  );

  assert.deepEqual(route.points, [
    { x: 390, y: 230 },
    { x: 390, y: 350 },
    { x: 230, y: 350 },
  ]);
});

test("the clean elbow is rejected when it would cross an obstacle", () => {
  const obstacle = createNodeRect("obstacle", 290, 320, 40, 60);
  const route = routeOrthogonalEdge(
    { x: 390, y: 230 },
    { x: 230, y: 350 },
    "bottom",
    "right",
    [obstacle]
  );

  assert.notDeepEqual(route.points, [
    { x: 390, y: 230 },
    { x: 390, y: 350 },
    { x: 230, y: 350 },
  ]);
  assertAvoids(route, obstacle);
});
