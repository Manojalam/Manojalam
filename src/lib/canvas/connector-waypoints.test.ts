import assert from "node:assert/strict";
import test from "node:test";
import { routeManualOrthogonalEdge } from "../layout/edge-routing";
import { insertWaypointOnRoute } from "./connector-waypoints";

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
