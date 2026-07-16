import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { smartRerouteBoardEdges } from "./smart-reroute";

function shape(id: string, x: number, y: number, data: Record<string, unknown> = {}): Node {
  return {
    id,
    type: "shape",
    position: { x, y },
    style: { width: 160, height: 80 },
    data: { shapeType: "rounded", ...data },
  };
}

test("safe reroute preserves manual bend anchors and attachment ports", () => {
  const nodes = [shape("source", 0, 0), shape("target", 400, 160)];
  const edge: Edge = {
    id: "edge",
    source: "source",
    target: "target",
    sourceHandle: "bottom",
    targetHandle: "top",
    data: {
      layoutMode: "freeForm",
      curveStyle: "step",
      preserveHandles: true,
      waypoints: [{ x: 200, y: 260 }],
    },
  };

  const result = smartRerouteBoardEdges(nodes, [edge]);
  assert.equal(result.preservedManualCount, 1);
  assert.equal(result.reroutedCount, 0);
  assert.equal(result.edges[0].sourceHandle, "bottom");
  assert.equal(result.edges[0].targetHandle, "top");
  assert.deepEqual(result.edges[0].data?.waypoints, [{ x: 200, y: 260 }]);
});

test("reset reroute clears bends and selects nearest ports", () => {
  const nodes = [shape("source", 0, 0), shape("target", 420, 20)];
  const edge: Edge = {
    id: "edge",
    source: "source",
    target: "target",
    sourceHandle: "bottom",
    targetHandle: "top",
    data: {
      layoutMode: "freeForm",
      curveStyle: "step",
      preserveHandles: true,
      waypoints: [{ x: 200, y: 260 }],
    },
  };

  const result = smartRerouteBoardEdges(nodes, [edge], { resetManualAdjustments: true });
  assert.equal(result.reroutedCount, 1);
  assert.equal(result.preservedManualCount, 0);
  assert.equal(result.edges[0].sourceHandle, "right");
  assert.equal(result.edges[0].targetHandle, "left");
  assert.equal(result.edges[0].data?.waypoints, undefined);
  assert.equal(result.edges[0].data?.preserveHandles, undefined);
});

test("automatic flowchart routes become obstacle-aware step connectors", () => {
  const nodes = [shape("source", 0, 0), shape("target", 400, 20)];
  const edge: Edge = {
    id: "edge",
    source: "source",
    target: "target",
    data: { layoutMode: "freeForm" },
  };

  const result = smartRerouteBoardEdges(nodes, [edge]);
  assert.equal(result.reroutedCount, 1);
  assert.equal(result.edges[0].data?.curveStyle, "step");
  assert.equal(result.edges[0].sourceHandle, "right");
  assert.equal(result.edges[0].targetHandle, "left");
});

test("reroute preserves explicit line styles, labels, and no-arrow endpoints", () => {
  const nodes = [shape("source", 0, 0), shape("target", 400, 20)];
  const edge: Edge = {
    id: "edge",
    source: "source",
    target: "target",
    data: {
      layoutMode: "freeForm",
      curveStyle: "straight",
      label: "Optional",
      arrowEnd: false,
    },
  };

  const result = smartRerouteBoardEdges(nodes, [edge]);
  assert.equal(result.edges[0].data?.curveStyle, "straight");
  assert.equal(result.edges[0].data?.label, "Optional");
  assert.equal(result.edges[0].markerEnd, undefined);
});

test("reroute reports unresolved connectors without rewriting them", () => {
  const edge: Edge = { id: "orphan", source: "missing", target: "target" };
  const result = smartRerouteBoardEdges([shape("target", 0, 0)], [edge]);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.changedCount, 0);
  assert.equal(result.edges[0], edge);
});

test("junction routes keep stable ports after a full reset", () => {
  const source = shape("source", 0, 0);
  const junction: Node = {
    id: "junction",
    type: "junction",
    position: { x: 300, y: 30 },
    style: { width: 20, height: 20 },
    data: { connectorJunction: true },
  };
  const edge: Edge = {
    id: "edge",
    source: "source",
    target: "junction",
    data: { waypoints: [{ x: 100, y: 200 }], preserveHandles: true },
  };

  const result = smartRerouteBoardEdges([source, junction], [edge], { resetManualAdjustments: true });
  assert.equal(result.edges[0].data?.waypoints, undefined);
  assert.equal(result.edges[0].data?.preserveHandles, true);
  assert.equal(result.edges[0].data?.layoutMode, "freeForm");
});
