import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";

import { resolveMatrixSectionExportPlan } from "./matrix-sections";

function fixture(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 0, y: 0 },
      style: { width: 600, height: 48 },
      data: {
        text: "Matrix title",
        layoutMode: "matrix",
        matrixCell: true,
        childOrder: ["branch-a", "branch-b"],
        layoutVisualStyle: {
          rootId: "root",
          mode: "matrix",
          scheme: "ocean",
          depth: 0,
          branchIndex: -1,
          fillColor: "#0c4a6e",
          borderColor: "#082f49",
          textColor: "#ffffff",
          accentColor: "#082f49",
          borderWidth: 0,
          borderStyle: "solid",
          fontSize: 20,
        },
      },
    },
    {
      id: "branch-a",
      type: "shape",
      position: { x: 0, y: 48 },
      style: { width: 240, height: 120 },
      data: { text: "First branch", parentId: "root", childOrder: ["a-child"] },
    },
    {
      id: "a-child",
      type: "shape",
      position: { x: 0, y: 168 },
      style: { width: 240, height: 80 },
      data: { text: "A child", parentId: "branch-a", childOrder: [] },
    },
    {
      id: "branch-b",
      type: "shape",
      position: { x: 240, y: 48 },
      style: { width: 360, height: 200 },
      data: { richText: "<p>Second &amp; branch</p>", parentId: "root", childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    { id: "root-a", source: "root", target: "branch-a" },
    { id: "a-child", source: "branch-a", target: "a-child" },
    { id: "root-b", source: "root", target: "branch-b" },
  ];
  return { nodes, edges };
}

test("plans one export per top-level Matrix branch with a resized root header", () => {
  const { nodes, edges } = fixture();
  const plan = resolveMatrixSectionExportPlan("root", nodes, edges, { padding: 12 });

  assert.ok(plan);
  assert.equal(plan.rootLabel, "Matrix title");
  assert.equal(plan.sections.length, 2);
  assert.equal(plan.folds.length, 1);
  assert.deepEqual(plan.sections.map((section) => section.label), [
    "First branch",
    "Second & branch",
  ]);

  const first = plan.sections[0];
  const second = plan.sections[1];
  assert.deepEqual(first.nodeIds, ["branch-a", "a-child"]);
  assert.deepEqual(first.edgeIds, ["a-child"]);
  assert.equal(first.kind, "child");
  assert.deepEqual(first.childIds, ["branch-a"]);
  assert.equal(first.headerOverlay.bounds.width, 240);
  assert.equal(second.headerOverlay.bounds.width, 360);
  assert.equal(first.headerOverlay.bounds.height, 48);
  assert.equal(first.headerOverlay.bounds.y + first.headerOverlay.bounds.height, 48);
  assert.deepEqual(first.bounds, {
    x: -12,
    y: -12,
    width: 264,
    height: 272,
  });
  assert.equal(first.headerOverlay.text, "Matrix title");
  assert.equal(first.headerOverlay.backgroundColor, "#0c4a6e");
  assert.equal(first.headerOverlay.color, "#ffffff");
});

test("plans authored root folds and manual breakpoints as full-width printable groups", () => {
  const { nodes, edges } = fixture();
  nodes[0] = {
    ...nodes[0],
    style: { width: 1_840, height: 48 },
    data: {
      ...nodes[0].data,
      childOrder: ["branch-a", "branch-b", "branch-c", "branch-d"],
      layoutFoldCount: 3,
      layoutFoldBreakAfter: ["branch-a", "branch-c"],
    },
  };
  nodes[3] = {
    ...nodes[3],
    position: { x: 620, y: 48 },
    style: { width: 240, height: 200 },
  };
  nodes.push(
    {
      id: "branch-c",
      type: "shape",
      position: { x: 860, y: 48 },
      style: { width: 360, height: 200 },
      data: { text: "Third branch", parentId: "root", childOrder: [] },
    },
    {
      id: "branch-d",
      type: "shape",
      position: { x: 1_240, y: 48 },
      style: { width: 600, height: 160 },
      data: { text: "Fourth branch", parentId: "root", childOrder: [] },
    }
  );
  edges.push(
    { id: "root-c", source: "root", target: "branch-c" },
    { id: "root-d", source: "root", target: "branch-d" }
  );

  const plan = resolveMatrixSectionExportPlan("root", nodes, edges);

  assert.ok(plan);
  assert.equal(plan.sections.length, 4);
  assert.equal(plan.folds.length, 3);
  assert.deepEqual(plan.folds.map((fold) => fold.label), [
    "Fold 1 · First branch",
    "Fold 2 · Second & branch – Third branch",
    "Fold 3 · Fourth branch",
  ]);
  assert.deepEqual(plan.folds.map((fold) => fold.childIds), [
    ["branch-a"],
    ["branch-b", "branch-c"],
    ["branch-d"],
  ]);
  assert.deepEqual(plan.folds[0].nodeIds, ["branch-a", "a-child"]);
  assert.equal(plan.folds[0].headerOverlay.bounds.x, 0);
  assert.equal(plan.folds[1].headerOverlay.bounds.x, 620);
  assert.equal(plan.folds[2].headerOverlay.bounds.x, 1_240);
  assert.equal(plan.folds[0].headerOverlay.bounds.width, 600);
  assert.equal(plan.folds[1].headerOverlay.bounds.width, 600);
  assert.equal(plan.folds[2].headerOverlay.bounds.width, 600);
  assert.equal(plan.folds[0].bounds.width, 600);
  assert.equal(plan.folds[1].bounds.width, 600);
  assert.equal(plan.folds[2].bounds.width, 600);
});

test("returns null for a non-Matrix hierarchy", () => {
  const { nodes, edges } = fixture();
  nodes[0] = {
    ...nodes[0],
    data: { ...nodes[0].data, layoutMode: "list" },
  };

  assert.equal(resolveMatrixSectionExportPlan("root", nodes, edges), null);
});
