import assert from "node:assert/strict";
import test from "node:test";

import type { Edge, Node } from "@xyflow/react";

import { getNodeRect } from "../layout/geometry";
import {
  flowchartBranchKind,
  routeTidiedFlowchartEdges,
  tidyFlowchart,
} from "./flowchart-tidy";

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

test("reserves attached note space while packing sibling branches", () => {
  const root = shape("root", 200, 0);
  const owner = shape("owner", 0, 220);
  const sibling = shape("sibling", 480, 220);
  const note: Node = {
    id: "owner-note",
    type: "text",
    position: { x: 136, y: 214 },
    style: { width: 280, height: 76 },
    data: { externalNote: true, noteForNodeId: owner.id, text: "Attached explanation" },
  };
  const result = tidyFlowchart([root, owner, sibling, note], [
    edge("root-owner", root.id, owner.id),
    edge("root-sibling", root.id, sibling.id),
  ], { direction: "vertical" });
  const laidOut = byId(result.nodes);
  const ownerRect = getNodeRect(laidOut.get(owner.id)!);
  const noteRect = getNodeRect(laidOut.get(note.id)!);
  const siblingRect = getNodeRect(laidOut.get(sibling.id)!);

  assert.deepEqual({
    x: noteRect.left - ownerRect.left,
    y: noteRect.top - ownerRect.top,
  }, {
    x: note.position.x - owner.position.x,
    y: note.position.y - owner.position.y,
  });
  assert.ok(siblingRect.left - noteRect.right >= 70);
});

test("moves a note out of the main horizontal connector corridor", () => {
  const source = shape("source", 0, 160);
  const target = shape("target", 560, 160);
  const note: Node = {
    id: "source-note",
    type: "text",
    position: { x: 150, y: 156 },
    style: { width: 220, height: 72 },
    data: { externalNote: true, noteForNodeId: source.id, text: "Explanation" },
  };
  const result = tidyFlowchart([source, target, note], [edge("flow", source.id, target.id)], {
    direction: "horizontal",
  });
  const laidOut = byId(result.nodes);
  const sourceRect = getNodeRect(laidOut.get(source.id)!);
  const noteRect = getNodeRect(laidOut.get(note.id)!);

  assert.ok(noteRect.bottom <= sourceRect.top - 27 || noteRect.top >= sourceRect.bottom + 27);
  assert.equal(result.movedNoteCount, 1);
});

test("keeps the affirmative decision branch on axis and moves the negative branch aside", () => {
  const decision = shape("decision", 200, 0, { shapeType: "diamond" }, 140, 110);
  const affirmative = shape("affirmative", 180, 260);
  const negative = shape("negative", 520, 260);
  const edges = [
    edge("yes", decision.id, affirmative.id, { data: { label: "आम्" } }),
    edge("no", decision.id, negative.id, { data: { label: "न" } }),
  ];
  const result = tidyFlowchart([decision, affirmative, negative], edges, { direction: "vertical" });
  const laidOut = byId(result.nodes);
  const decisionRect = getNodeRect(laidOut.get(decision.id)!);
  const affirmativeRect = getNodeRect(laidOut.get(affirmative.id)!);
  const negativeRect = getNodeRect(laidOut.get(negative.id)!);

  assert.ok(Math.abs(decisionRect.centerX - affirmativeRect.centerX) < 1);
  assert.ok(negativeRect.left - affirmativeRect.right >= 55);

  const routed = routeTidiedFlowchartEdges(result.nodes, edges, result);
  assert.equal(routed.semanticBranchCount, 2);
  assert.equal(routed.edges[0].sourceHandle, "bottom");
  assert.equal(routed.edges[0].targetHandle, "top");
  assert.equal(routed.edges[0].data?.manualRoute, false);
  assert.equal(routed.edges[1].sourceHandle, "right");
  assert.equal(routed.edges[1].targetHandle, "left");
  assert.equal(routed.edges[1].data?.preserveHandles, true);
});

test("uses rightward affirmative and downward negative ports in a horizontal flow", () => {
  const decision = shape("decision", 0, 200, { shapeType: "diamond" }, 140, 110);
  const affirmative = shape("affirmative", 320, 190);
  const negative = shape("negative", 320, 520);
  const edges = [
    edge("yes", decision.id, affirmative.id, { data: { label: "Yes" } }),
    edge("no", decision.id, negative.id, { data: { label: "No" } }),
  ];
  const layout = tidyFlowchart([decision, affirmative, negative], edges, { direction: "horizontal" });
  const laidOut = byId(layout.nodes);
  const decisionRect = getNodeRect(laidOut.get(decision.id)!);
  const affirmativeRect = getNodeRect(laidOut.get(affirmative.id)!);
  const negativeRect = getNodeRect(laidOut.get(negative.id)!);

  assert.ok(Math.abs(decisionRect.centerY - affirmativeRect.centerY) < 1);
  assert.ok(negativeRect.top - affirmativeRect.bottom >= 55);

  const routed = routeTidiedFlowchartEdges(layout.nodes, edges, layout);
  assert.equal(routed.edges[0].sourceHandle, "right");
  assert.equal(routed.edges[0].targetHandle, "left");
  assert.equal(routed.edges[1].sourceHandle, "bottom");
  assert.equal(routed.edges[1].targetHandle, "top");
});

test("moves feedback connectors into distinct outer lanes and reanchors their labels", () => {
  const nodes = [shape("a", 0, 0), shape("b", 0, 220), shape("c", 0, 440)];
  const edges = [
    edge("ab", "a", "b"),
    edge("bc", "b", "c"),
    edge("ca", "c", "a", { data: { label: "Retry", labelOffset: { x: 80, y: 40 } } }),
    edge("cb", "c", "b", { data: { label: "Review" } }),
  ];
  const layout = tidyFlowchart(nodes, edges, { direction: "vertical" });
  const routed = routeTidiedFlowchartEdges(layout.nodes, edges, layout);
  const feedback = routed.edges.slice(2);
  const chartLeft = Math.min(...layout.nodes.map((node) => getNodeRect(node).left));

  assert.equal(routed.laneRoutedCount, 2);
  assert.equal(routed.resetLabelOffsetCount, 1);
  assert.equal(feedback[0].sourceHandle, "left");
  assert.equal(feedback[0].targetHandle, "left");
  assert.equal(feedback[0].data?.labelOffset, undefined);
  assert.equal(feedback[0].data?.waypointOrigin, "segment-drag");
  assert.ok((feedback[0].data?.waypoints as Array<{ x: number }>)[0].x < chartLeft);
  assert.ok(
    (feedback[1].data?.waypoints as Array<{ x: number }>)[0].x
      < (feedback[0].data?.waypoints as Array<{ x: number }>)[0].x
  );
});

test("recognizes localized affirmative and negative connector labels", () => {
  assert.equal(flowchartBranchKind(edge("yes", "a", "b", { data: { label: "आम्" } })), "affirmative");
  assert.equal(flowchartBranchKind(edge("no", "a", "b", { data: { label: "न" } })), "negative");
  assert.equal(flowchartBranchKind(edge("custom-yes", "a", "b", {
    data: { label: "My custom outcome", labelColor: "#22c55e", labelColorSynced: true },
  })), "affirmative");
  assert.equal(flowchartBranchKind(edge("custom-no", "a", "b", {
    data: { label: "Another outcome", labelColor: "#ef4444", labelColorSynced: true },
  })), "negative");
  assert.equal(flowchartBranchKind(edge("custom", "a", "b", { data: { label: "Optional" } })), "other");
});
