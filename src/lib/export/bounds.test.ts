import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";

import { computeTightExportBounds, resolveExportTarget } from "./bounds";

type Rect = { left: number; top: number; width: number; height: number };

function mockElement({
  attributes = {},
  rect,
  descendants = {},
}: {
  attributes?: Record<string, string>;
  rect: Rect;
  descendants?: Record<string, unknown[]>;
}) {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    getBoundingClientRect: () => rect,
    querySelectorAll: (selector: string) => descendants[selector] ?? [],
    closest: () => null,
    matches: () => false,
  };
}

test("live chart DOM bounds replace stale React Flow measurements", () => {
  const node: Node = {
    id: "chart",
    type: "sunburst",
    position: { x: 100, y: 200 },
    data: {},
    // This can temporarily retain an old expanded visual size after a chart
    // resize while the actual node has already rendered at 600 x 600.
    measured: { width: 1_400, height: 12_000 },
    style: { width: 600, height: 600 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [node.id], edgeIds: [] },
    [node],
    []
  );
  const renderedNode = mockElement({
    attributes: { "data-id": node.id },
    // Flow rect (100, 200, 600, 600) at viewport (30, 40, 0.1).
    rect: { left: 40, top: 60, width: 60, height: 60 },
  });
  const root = {
    querySelectorAll: (selector: string) => selector === ".react-flow__node[data-id]"
      ? [renderedNode]
      : [],
  };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 0,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 30, y: 40, zoom: 0.1 },
    },
  });

  assert.deepEqual(bounds, { x: 100, y: 200, width: 600, height: 600 });
});

test("whole-board bounds tightly union rendered objects instead of stale model space", () => {
  const nodes: Node[] = [
    {
      id: "first-card",
      position: { x: 80, y: 120 },
      data: {},
      measured: { width: 900, height: 18_000 },
      style: { width: 320, height: 180 },
    },
    {
      id: "second-card",
      position: { x: 460, y: 390 },
      data: {},
      measured: { width: 4_000, height: 8_000 },
      style: { width: 280, height: 210 },
    },
  ];
  const target = resolveExportTarget({ kind: "board" }, nodes, []);
  const renderedNodes = [
    mockElement({
      attributes: { "data-id": nodes[0].id },
      rect: { left: 80, top: 120, width: 320, height: 180 },
    }),
    mockElement({
      attributes: { "data-id": nodes[1].id },
      rect: { left: 460, top: 390, width: 280, height: 210 },
    }),
  ];
  const root = {
    querySelectorAll: (selector: string) => selector === ".react-flow__node[data-id]"
      ? renderedNodes
      : [],
  };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 32,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });

  assert.deepEqual(bounds, { x: 48, y: 88, width: 724, height: 544 });
});

test("model bounds remain the fallback for a target without rendered DOM", () => {
  const node: Node = {
    id: "not-rendered",
    position: { x: 40, y: 60 },
    data: {},
    measured: { width: 240, height: 180 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [node.id], edgeIds: [] },
    [node],
    []
  );
  const root = { querySelectorAll: () => [] };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 0,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });

  assert.deepEqual(bounds, { x: 40, y: 60, width: 240, height: 180 });
});

test("explicit chart ink bounds still extend the authoritative node DOM rectangle", () => {
  const node: Node = {
    id: "chart-with-overflow",
    position: { x: 100, y: 200 },
    data: {},
    measured: { width: 3_000, height: 9_000 },
  };
  const target = resolveExportTarget(
    { kind: "selection", nodeIds: [node.id], edgeIds: [] },
    [node],
    []
  );
  const visibleInk = mockElement({
    rect: { left: 80, top: 190, width: 670, height: 630 },
  });
  const renderedNode = mockElement({
    attributes: { "data-id": node.id },
    rect: { left: 100, top: 200, width: 600, height: 600 },
    descendants: { "[data-export-bounds]": [visibleInk] },
  });
  const root = {
    querySelectorAll: (selector: string) => selector === ".react-flow__node[data-id]"
      ? [renderedNode]
      : [],
  };
  const flowContainer = mockElement({
    rect: { left: 0, top: 0, width: 1_920, height: 1_080 },
  });

  const bounds = computeTightExportBounds(target, {
    padding: 0,
    dom: {
      root: root as unknown as ParentNode,
      flowContainer: flowContainer as unknown as Element,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });

  assert.deepEqual(bounds, { x: 80, y: 190, width: 670, height: 630 });
});
