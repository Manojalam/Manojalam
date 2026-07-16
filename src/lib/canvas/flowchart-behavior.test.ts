import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildListConnectorModel } from "../layout/list-layout";
import { buildTreeConnectorModel } from "../layout/tree-layout";
import { buildHierarchy } from "../layout/hierarchy";
import {
  isConnectorConnectionAllowed,
  manualizeFlowchartBranch,
  normalizeImplicitFlowchartRoutes,
  placeFlowchartInsertions,
  rerouteFlowchartInsertionEdges,
  usesManualFlowchartPlacement,
} from "./flowchart-behavior";

function shape(
  id: string,
  x: number,
  y: number,
  parentId: string | null,
  extraData: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: "shape",
    position: { x, y },
    measured: { width: 160, height: 80 },
    data: { text: id, parentId, ...extraData },
  };
}

test("ordinary shape additions are manual-first but specialized layouts remain structured", () => {
  const parent = shape("parent", 0, 0, null);
  assert.equal(usesManualFlowchartPlacement(parent), true);
  assert.equal(usesManualFlowchartPlacement(parent, "horizontal"), true);
  assert.equal(usesManualFlowchartPlacement(parent, "vertical"), true);
  assert.equal(usesManualFlowchartPlacement(parent, "freeForm"), true);
  assert.equal(usesManualFlowchartPlacement(parent, "list"), false);
  assert.equal(usesManualFlowchartPlacement(parent, "matrix"), false);
  assert.equal(usesManualFlowchartPlacement(parent, "radial"), false);
  assert.equal(usesManualFlowchartPlacement({ ...parent, type: "sticky" }, "horizontal"), false);
});

test("an existing connector can move to another handle on the same nodes", () => {
  const edges: Edge[] = [{ id: "edge", source: "parent", target: "child" }];

  assert.equal(isConnectorConnectionAllowed(edges, {
    source: "parent",
    target: "child",
  }), false);
  assert.equal(isConnectorConnectionAllowed(edges, {
    source: "parent",
    target: "child",
  }, "edge"), true);
  assert.equal(isConnectorConnectionAllowed([
    ...edges,
    { id: "duplicate", source: "parent", target: "child" },
  ], {
    source: "parent",
    target: "child",
  }, "edge"), false);
  assert.equal(isConnectorConnectionAllowed(edges, {
    source: "parent",
    target: "parent",
  }, "edge"), false);
});

test("manualizing a flowchart preserves node positions and converts only its branch edges", () => {
  const nodes = [
    shape("root", 40, 80, null, { layoutMode: "horizontal", childOrder: ["decision"] }),
    shape("decision", 320, 80, "root"),
    shape("outside", 900, 300, null),
  ];
  const edges: Edge[] = [
    {
      id: "branch",
      source: "root",
      target: "decision",
      sourceHandle: "right",
      targetHandle: "left",
      data: { layoutMode: "horizontal", curveStyle: "step" },
    },
    { id: "outside-edge", source: "outside", target: "decision", data: { curveStyle: "smooth" } },
  ];
  const before = new Map(nodes.map((node) => [node.id, { ...node.position }]));
  const result = manualizeFlowchartBranch(nodes, edges, "root", buildHierarchy(nodes, edges));

  assert.deepEqual(result.nodes.map((node) => node.position), nodes.map((node) => node.position));
  assert.deepEqual(result.nodes.find((node) => node.id === "root")?.data.layoutMode, "freeForm");
  assert.deepEqual(result.edges[0].sourceHandle, "right");
  assert.deepEqual(result.edges[0].targetHandle, "left");
  assert.equal(result.edges[0].data?.manualRoute, true);
  assert.equal(result.edges[0].data?.layoutMode, "freeForm");
  assert.deepEqual(result.edges[1], edges[1]);
  for (const node of result.nodes) assert.deepEqual(node.position, before.get(node.id));
});

test("collision handling moves only the newly inserted flowchart node", () => {
  const nodes = [
    shape("parent", 0, 0, null),
    shape("existing", 280, 0, null),
    shape("inserted", 280, 0, "parent"),
  ];
  const placed = placeFlowchartInsertions(nodes, ["inserted"]);

  assert.deepEqual(placed.find((node) => node.id === "parent")?.position, { x: 0, y: 0 });
  assert.deepEqual(placed.find((node) => node.id === "existing")?.position, { x: 280, y: 0 });
  assert.notDeepEqual(placed.find((node) => node.id === "inserted")?.position, { x: 280, y: 0 });
});

test("a first child continues its parent's live incoming direction", () => {
  const nodes = [
    shape("root", 0, 0, null, { childOrder: ["parent"] }),
    shape("parent", 0, 180, "root", { childOrder: ["inserted"] }),
    shape("inserted", 280, 180, "parent"),
  ];
  const placed = placeFlowchartInsertions(nodes, ["inserted"]);
  const inserted = placed.find((node) => node.id === "inserted");

  assert.deepEqual(inserted?.position, { x: 0, y: 324 });

  const routed = rerouteFlowchartInsertionEdges(placed, [{
    id: "new-edge",
    source: "parent",
    target: "inserted",
    sourceHandle: "right",
    targetHandle: "left",
  }], ["inserted"]);
  assert.equal(routed[0].sourceHandle, "bottom");
  assert.equal(routed[0].targetHandle, "top");
});

test("moving a branch changes the direction followed by its next child", () => {
  const nodes = [
    shape("root", 0, 0, null, { childOrder: ["parent"] }),
    shape("parent", 300, 0, "root", { childOrder: ["inserted"] }),
    shape("inserted", 300, 200, "parent"),
  ];
  const placed = placeFlowchartInsertions(nodes, ["inserted"]);

  assert.deepEqual(placed.find((node) => node.id === "inserted")?.position, { x: 564, y: 0 });
});

test("additional children stay on the side established by the latest child", () => {
  const nodes = [
    shape("parent", 300, 300, null, { childOrder: ["existing", "inserted"] }),
    shape("existing", 300, 100, "parent"),
    shape("inserted", 580, 300, "parent"),
  ];
  const placed = placeFlowchartInsertions(nodes, ["inserted"]);

  assert.deepEqual(placed.find((node) => node.id === "inserted")?.position, { x: 524, y: 100 });
});

test("manual flowchart edges are excluded from shared tree and list connector buses", () => {
  const nodes = [
    shape("root", 0, 0, null, { childOrder: ["child"] }),
    shape("child", 280, 0, "root"),
  ];
  const treeEdge: Edge = {
    id: "tree-edge",
    source: "root",
    target: "child",
    data: { layoutMode: "horizontal", manualRoute: true },
  };
  const listEdge: Edge = {
    ...treeEdge,
    id: "list-edge",
    data: { layoutMode: "list", manualRoute: true },
  };

  assert.deepEqual(buildTreeConnectorModel(nodes, [treeEdge]).groups, []);
  assert.deepEqual(buildListConnectorModel(nodes, [listEdge]).groups, []);
});

test("old implicit Horizontal shape edges repair on load while explicit layouts remain grouped", () => {
  const implicitNodes = [
    shape("root", 0, 0, null, { childOrder: ["child"] }),
    shape("child", 280, 0, "root"),
  ];
  const edge: Edge = {
    id: "legacy-edge",
    source: "root",
    target: "child",
    sourceHandle: "right",
    targetHandle: "left",
    data: { layoutMode: "horizontal", curveStyle: "step" },
  };
  const repaired = normalizeImplicitFlowchartRoutes(implicitNodes, [edge]);
  assert.equal(repaired[0].data?.manualRoute, true);
  assert.equal(repaired[0].data?.layoutMode, "freeForm");
  assert.equal(repaired[0].sourceHandle, "right");
  assert.equal(repaired[0].targetHandle, "left");

  const explicitNodes = implicitNodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutMode: "horizontal" } }
    : node);
  const explicitEdges = [edge];
  assert.equal(normalizeImplicitFlowchartRoutes(explicitNodes, explicitEdges), explicitEdges);
});
