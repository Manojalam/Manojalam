import assert from "node:assert/strict";
import test from "node:test";
import { routeManualOrthogonalEdge, routeOrthogonalEdge } from "../layout/edge-routing";
import {
  closestPointOnRoute,
  dragRouteSegmentToWaypoints,
  draggableRouteSegments,
  insertWaypointOnRoute,
  routeBendPoints,
} from "./connector-waypoints";

test("a direct vertical connection can be dragged sideways without endpoint loops", () => {
  const source = { x: 100, y: 100 };
  const target = { x: 100, y: 300 };
  const route = [source, target];
  const waypoints = dragRouteSegmentToWaypoints(route, 0, 160, "bottom", "top");
  const manual = routeManualOrthogonalEdge(source, target, "bottom", "top", waypoints);

  assert.deepEqual(waypoints, [{ x: 160, y: 120 }, { x: 160, y: 280 }]);
  assert.deepEqual(manual.points, [
    source,
    { x: 100, y: 120 },
    { x: 160, y: 120 },
    { x: 160, y: 280 },
    { x: 100, y: 280 },
    target,
  ]);
});

test("dragging a translated direct segment back into alignment clears its manual anchors", () => {
  assert.deepEqual(dragRouteSegmentToWaypoints(
    [{ x: 100, y: 100 }, { x: 100, y: 300 }],
    0,
    100,
    "bottom",
    "top"
  ), []);
});

test("dragging an internal horizontal segment translates both adjoining bends", () => {
  const source = { x: 100, y: 100 };
  const target = { x: 500, y: 300 };
  const route = [
    source,
    { x: 120, y: 100 },
    { x: 120, y: 180 },
    { x: 480, y: 180 },
    { x: 480, y: 300 },
    target,
  ];
  const waypoints = dragRouteSegmentToWaypoints(route, 2, 220, "right", "left");
  const manual = routeManualOrthogonalEdge(source, target, "right", "left", waypoints);

  assert.deepEqual(waypoints, [{ x: 120, y: 220 }, { x: 480, y: 220 }]);
  assert.deepEqual(manual.points, [
    source,
    { x: 120, y: 100 },
    { x: 120, y: 220 },
    { x: 480, y: 220 },
    { x: 480, y: 300 },
    target,
  ]);
});

test("only non-zero orthogonal route segments become direct drag targets", () => {
  assert.deepEqual(draggableRouteSegments([
    { x: 10, y: 10 },
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 100, y: 20 },
    { x: 100, y: 80 },
  ]).map(({ index, orientation }) => ({ index, orientation })), [
    { index: 1, orientation: "horizontal" },
    { index: 3, orientation: "vertical" },
  ]);
});

test("additional bend points are inserted in route order without changing the path", () => {
  const source = { x: 100, y: 100 };
  const target = { x: 600, y: 280 };
  const existing = [{ x: 430, y: 40 }];
  const before = routeManualOrthogonalEdge(source, target, "right", "left", existing);
  const waypoints = insertWaypointOnRoute(before.points, existing);
  const after = routeManualOrthogonalEdge(source, target, "right", "left", waypoints);

  assert.equal(waypoints.length, 2);
  assert.deepEqual(after.points, before.points);
});

test("a first bend point is created directly on the current connector", () => {
  const route = [
    { x: 100, y: 100 },
    { x: 100, y: 20 },
    { x: 500, y: 20 },
    { x: 500, y: 100 },
  ];
  const waypoints = insertWaypointOnRoute(route, []);

  assert.deepEqual(waypoints, [{ x: 300, y: 20 }]);
});

test("connector clicks project onto the nearest routed segment", () => {
  const route = [
    { x: 100, y: 100 },
    { x: 100, y: 20 },
    { x: 500, y: 20 },
    { x: 500, y: 100 },
  ];

  assert.deepEqual(closestPointOnRoute(route, { x: 312, y: 27 }), { x: 312, y: 20 });
  assert.deepEqual(closestPointOnRoute(route, { x: 493, y: 82 }), { x: 500, y: 82 });
});

test("automatic corners can be promoted without changing the visible route", () => {
  const source = { x: 390, y: 230 };
  const target = { x: 230, y: 350 };
  const automatic = routeOrthogonalEdge(source, target, "bottom", "right", []);
  const promoted = routeBendPoints(automatic.points);
  const manual = routeManualOrthogonalEdge(source, target, "bottom", "right", promoted);

  assert.deepEqual(promoted, [{ x: 390, y: 350 }]);
  assert.deepEqual(manual.points, automatic.points);
});

test("only real corners become draggable automatic bends", () => {
  const route = [
    { x: 100, y: 100 },
    { x: 100, y: 140 },
    { x: 100, y: 200 },
    { x: 260, y: 200 },
    { x: 260, y: 260 },
  ];

  assert.deepEqual(routeBendPoints(route), [
    { x: 100, y: 200 },
    { x: 260, y: 200 },
  ]);
});
