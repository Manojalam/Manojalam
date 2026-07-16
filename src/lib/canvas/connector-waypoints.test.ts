import assert from "node:assert/strict";
import test from "node:test";
import { routeManualOrthogonalEdge, routeOrthogonalEdge } from "../layout/edge-routing";
import { closestPointOnRoute, insertWaypointOnRoute, routeBendPoints } from "./connector-waypoints";

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
