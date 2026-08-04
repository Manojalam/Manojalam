import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  buildPresentationStops,
  orderPresentationNodes,
  presentationNodeTitle,
} from "./presentation";

function makeNode(
  id: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
  type = "shape",
  width = 160,
  height = 80
): Node {
  return { id, type, position: { x, y }, data, style: { width, height } };
}

test("uses authored frames as ordered teaching sections", () => {
  const nodes = [
    makeNode("frame-b", 500, 0, { title: "Practice" }, "frame", 400, 300),
    makeNode("inside-b", 620, 100, { text: "Try it" }),
    makeNode("frame-a", 0, 0, { title: "Warm up" }, "frame", 400, 300),
    makeNode("inside-a", 120, 100, { text: "Remember" }),
  ];

  const stops = buildPresentationStops(nodes, []);

  assert.deepEqual(stops.map((stop) => stop.title), [
    "Board overview",
    "Warm up",
    "Practice",
  ]);
  assert.deepEqual(stops[1].nodeIds, ["frame-a", "inside-a"]);
  assert.deepEqual(stops[2].nodeIds, ["frame-b", "inside-b"]);
});

test("turns a hierarchy into a chart stop and focused branch stops", () => {
  const nodes = [
    makeNode("root", 0, 0, { text: "The water cycle" }),
    makeNode("rain", 250, 0, { text: "Rain", parentId: "root" }),
    makeNode("clouds", 250, 180, { text: "Clouds", parentId: "root" }),
    makeNode("drops", 500, 0, { text: "Water drops", parentId: "rain" }),
  ];
  const edges: Edge[] = [
    { id: "root-rain", source: "root", target: "rain" },
    { id: "root-clouds", source: "root", target: "clouds" },
    { id: "rain-drops", source: "rain", target: "drops" },
  ];

  const stops = buildPresentationStops(nodes, edges);

  assert.deepEqual(stops.map((stop) => stop.kind), ["overview", "chart", "branch", "branch"]);
  assert.deepEqual(stops.map((stop) => stop.title), [
    "Board overview",
    "The water cycle",
    "Rain",
    "Clouds",
  ]);
  assert.deepEqual(stops[2].nodeIds, ["root", "rain", "drops"]);
});

test("supports row-by-row and column-by-column teaching paths", () => {
  const nodes = [
    makeNode("lower-left", 0, 200, { text: "Lower left" }),
    makeNode("upper-right", 300, 30, { text: "Upper right" }),
    makeNode("lower-right", 300, 230, { text: "Lower right" }),
    makeNode("upper-left", 0, 0, { text: "Upper left" }),
  ];

  assert.deepEqual(
    orderPresentationNodes(nodes, "rows").map((node) => node.id),
    ["upper-left", "upper-right", "lower-left", "lower-right"]
  );
  assert.deepEqual(
    orderPresentationNodes(nodes, "columns").map((node) => node.id),
    ["upper-left", "lower-left", "upper-right", "lower-right"]
  );
  assert.deepEqual(
    buildPresentationStops(nodes, [], "columns").slice(1).map((stop) => stop.title),
    ["Upper left", "Lower left", "Upper right", "Lower right"]
  );
});

test("creates clean, concise presenter labels from rich text", () => {
  const node = makeNode("rich", 0, 0, {
    text: "<p>Plants &amp; sunlight make a wonderfully long lesson title for children to explore</p>",
  });

  assert.equal(
    presentationNodeTitle(node, "Topic"),
    "Plants & sunlight make a wonderfully long lesson ti…"
  );
});
