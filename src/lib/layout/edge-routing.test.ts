import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRect, type NodeRect } from "./geometry";
import { EDGE_OBSTACLE_PADDING, routeLayoutEdge, routeRectilinearEdge } from "./edge-routing";

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

test("orthogonal routes detour around intervening boxes", () => {
  const source = createNodeRect("source", 0, 80, 160, 80);
  const target = createNodeRect("target", 520, 80, 160, 80);
  const obstacle = createNodeRect("obstacle", 260, 40, 160, 160);
  const route = routeRectilinearEdge(source, target, [obstacle]);

  assert.ok(route.points.length >= 5);
  assertAvoids(route, obstacle);
});
