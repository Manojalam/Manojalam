import assert from "node:assert/strict";
import test from "node:test";

import type { Edge, Node } from "@xyflow/react";

import { getNodeRect } from "../layout/geometry";
import { tidyFlowchart } from "./flowchart-tidy";

function shape(
  id: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
  width = 120,
  height = 64
): Node {
  return {
    id,
    type: "shape",
    position: { x, y },
    style: { width, height },
    data: { text: id, shapeType: "rounded", ...data },
  };
}

function edge(id: string, source: string, target: string, extra: Partial<Edge> = {}): Edge {
  return { id, source, target, ...extra };
}

function byId(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((node) => [node.id, node]));
}

test("aligns a directed chain into clear top-to-bottom layers", () => {
  const nodes = [
    shape("start", 300, 40),
    shape("decision", 20, 350, {}, 140, 100),
    shape("result", 500, 180),
  ];
  const result = tidyFlowchart(nodes, [
    edge("one", "start", "decision"),
    edge("two", "decision", "result"),
  ], { direction: "vertical" });
  const laidOut = byId(result.nodes);
  const start = getNodeRect(laidOut.get("start")!);
  const decision = getNodeRect(laidOut.get("decision")!);
  const output = getNodeRect(laidOut.get("result")!);

  assert.equal(result.direction, "vertical");
  assert.ok(decision.top - start.bottom >= 110);
  assert.ok(output.top - decision.bottom >= 110);
  assert.ok(Math.abs(start.centerX - decision.centerX) < 1);
  assert.ok(Math.abs(decision.centerX - output.centerX) < 1);
});

test("reorders layers so simple crossed branches become uncrossed", () => {
  const nodes = [
    shape("source-a", 0, 0),
    shape("source-b", 300, 0),
    shape("target-b", 0, 260),
    shape("target-a", 300, 260),
  ];
  const result = tidyFlowchart(nodes, [
    edge("a", "source-a", "target-a"),
    edge("b", "source-b", "target-b"),
  ], { direction: "vertical" });
  const laidOut = byId(result.nodes);
  const sourceA = getNodeRect(laidOut.get("source-a")!).centerX;
  const sourceB = getNodeRect(laidOut.get("source-b")!).centerX;
  const targetA = getNodeRect(laidOut.get("target-a")!).centerX;
  const targetB = getNodeRect(laidOut.get("target-b")!).centerX;

  assert.ok((sourceA - sourceB) * (targetA - targetB) > 0);
});

test("breaks feedback edges for ranking without losing cyclic nodes", () => {
  const nodes = [shape("a", 0, 0), shape("b", 200, 100), shape("c", 40, 240)];
  const result = tidyFlowchart(nodes, [
    edge("ab", "a", "b"),
    edge("bc", "b", "c"),
    edge("ca", "c", "a"),
  ], { direction: "vertical" });
  const ranks = Object.values(result.rankByNodeId);

  assert.equal(result.layoutNodeIds.length, 3);
  assert.equal(new Set(ranks).size, 3);
  result.nodes.forEach((node) => {
    assert.ok(Number.isFinite(node.position.x));
    assert.ok(Number.isFinite(node.position.y));
  });
});

test("packs disconnected flow groups without overlap", () => {
  const nodes = [
    shape("a", 0, 0), shape("b", 0, 180),
    shape("c", 40, 30), shape("d", 40, 220),
  ];
  const result = tidyFlowchart(nodes, [edge("ab", "a", "b"), edge("cd", "c", "d")], {
    direction: "vertical",
  });
  const laidOut = byId(result.nodes);
  const first = [getNodeRect(laidOut.get("a")!), getNodeRect(laidOut.get("b")!)];
  const second = [getNodeRect(laidOut.get("c")!), getNodeRect(laidOut.get("d")!)];
  const firstRight = Math.max(...first.map((rect) => rect.right));
  const secondLeft = Math.min(...second.map((rect) => rect.left));

  assert.equal(result.componentCount, 2);
  assert.ok(secondLeft - firstRight >= 175);
});

test("keeps locked nodes fixed and moves attached notes with their source", () => {
  const owner = shape("owner", 760, 640);
  const note: Node = {
    id: "note",
    type: "text",
    position: { x: 930, y: 650 },
    style: { width: 220, height: 72 },
    data: { externalNote: true, noteForNodeId: "owner", text: "Note" },
  };
  const locked = shape("locked", 500, 300, { locked: true });
  const result = tidyFlowchart([locked, owner, note], [edge("flow", "locked", "owner")], {
    direction: "vertical",
  });
  const laidOut = byId(result.nodes);
  const movedOwner = laidOut.get("owner")!;
  const movedNote = laidOut.get("note")!;
  const ownerDelta = {
    x: movedOwner.position.x - owner.position.x,
    y: movedOwner.position.y - owner.position.y,
  };

  assert.deepEqual(laidOut.get("locked")!.position, locked.position);
  assert.deepEqual(movedNote.position, {
    x: note.position.x + ownerDelta.x,
    y: note.position.y + ownerDelta.y,
  });
  assert.equal(result.lockedNodeCount, 1);
  assert.equal(result.movedNoteCount, 1);
});

test("does not rearrange unconnected annotations or chart objects", () => {
  const annotation = shape("annotation", 900, 700);
  const chart: Node = {
    id: "chart",
    type: "sunburst",
    position: { x: 1200, y: 100 },
    style: { width: 500, height: 500 },
    data: {},
  };
  const nodes = [shape("a", 0, 0), shape("b", 200, 200), annotation, chart];
  const result = tidyFlowchart(nodes, [
    edge("ab", "a", "b"),
    edge("chart-link", "b", "chart"),
  ], { direction: "vertical" });
  const laidOut = byId(result.nodes);

  assert.deepEqual(laidOut.get("annotation")!.position, annotation.position);
  assert.deepEqual(laidOut.get("chart")!.position, chart.position);
  assert.deepEqual(new Set(result.layoutNodeIds), new Set(["a", "b"]));
});

test("auto direction recognizes a predominantly left-to-right flow", () => {
  const nodes = [shape("a", 0, 0), shape("b", 300, 20), shape("c", 620, 10)];
  const result = tidyFlowchart(nodes, [
    edge("ab", "a", "b", { sourceHandle: "right", targetHandle: "left" }),
    edge("bc", "b", "c", { sourceHandle: "right", targetHandle: "left" }),
  ]);
  const laidOut = byId(result.nodes);

  assert.equal(result.direction, "horizontal");
  assert.ok(getNodeRect(laidOut.get("b")!).left > getNodeRect(laidOut.get("a")!).right);
  assert.ok(getNodeRect(laidOut.get("c")!).left > getNodeRect(laidOut.get("b")!).right);
});

test("produces deterministic positions for the same rough chart", () => {
  const nodes = [shape("a", 50, 50), shape("b", 300, 180), shape("c", 0, 300)];
  const edges = [edge("ab", "a", "b"), edge("ac", "a", "c")];
  const first = tidyFlowchart(nodes, edges, { direction: "vertical" });
  const second = tidyFlowchart(nodes, edges, { direction: "vertical" });

  assert.deepEqual(
    first.nodes.map((node) => node.position),
    second.nodes.map((node) => node.position)
  );
});
