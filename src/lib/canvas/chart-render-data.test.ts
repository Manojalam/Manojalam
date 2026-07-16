import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";

import {
  chartHierarchyEdgeToken,
  chartNodeContentToken,
} from "./chart-render-data";

test("chart node content ignores transient canvas movement and selection", () => {
  const data = { label: "Root" };
  const before: Node[] = [{ id: "root", type: "mindmap", position: { x: 0, y: 0 }, data }];
  const moved: Node[] = [{
    ...before[0],
    position: { x: 240, y: 120 },
    selected: true,
    dragging: true,
  }];

  assert.equal(chartNodeContentToken(before), chartNodeContentToken(moved));
});

test("chart node content changes for chart-visible data and structure", () => {
  const before: Node[] = [{
    id: "root",
    type: "mindmap",
    position: { x: 0, y: 0 },
    data: { label: "Root" },
  }];
  const relabeled: Node[] = [{
    ...before[0],
    data: { label: "Renamed" },
  }];
  const retyped: Node[] = [{
    ...relabeled[0],
    type: "shape",
  }];

  assert.notEqual(chartNodeContentToken(before), chartNodeContentToken(relabeled));
  assert.notEqual(chartNodeContentToken(relabeled), chartNodeContentToken(retyped));
});

test("chart hierarchy edges ignore routing-only changes", () => {
  const before: Edge[] = [{ id: "edge", source: "root", target: "child" }];
  const rerouted: Edge[] = [{
    ...before[0],
    sourceHandle: "right-source",
    targetHandle: "left-target",
    selected: true,
  }];
  const reconnected: Edge[] = [{
    ...rerouted[0],
    target: "other-child",
  }];

  assert.equal(chartHierarchyEdgeToken(before), chartHierarchyEdgeToken(rerouted));
  assert.notEqual(chartHierarchyEdgeToken(rerouted), chartHierarchyEdgeToken(reconnected));
});
