import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import { applyLayoutPalette } from "./layout-palette";
import { computeLayoutNodeSizes, resolveLayoutFontSize } from "./layout-presentation";

function fixture(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 0, y: 0 },
      data: { text: "Grammar", shapeType: "rounded", parentId: null, childOrder: ["short", "long"] },
    },
    {
      id: "short",
      type: "shape",
      position: { x: 0, y: 100 },
      data: { text: "Case", shapeType: "rounded", parentId: "root" },
    },
    {
      id: "long",
      type: "shape",
      position: { x: 0, y: 200 },
      data: {
        text: "A considerably longer Sanskrit grammar category with several readable words and details",
        shapeType: "rounded",
        parentId: "root",
      },
    },
  ];
  const edges: Edge[] = [
    { id: "root-short", source: "root", target: "short" },
    { id: "root-long", source: "root", target: "long" },
  ];
  return { nodes, edges };
}

test("generated typography remains readable and follows hierarchy roles", () => {
  const { nodes, edges } = fixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "list", "spectrum");
  const rootData = styled.nodes[0].data as Record<string, unknown>;
  const childData = styled.nodes[1].data as Record<string, unknown>;

  assert.equal(resolveLayoutFontSize(rootData), 22);
  assert.equal(resolveLayoutFontSize(childData), 19);
  assert.ok((resolveLayoutFontSize(childData) ?? 0) >= 17);
});

test("List keeps readable node sizes and lets long text increase row height", () => {
  const { nodes, edges } = fixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "list", "forest");
  const sizes = computeLayoutNodeSizes(styled.nodes, hierarchy, "root", "list");

  assert.ok((sizes.get("long")?.height ?? 0) > (sizes.get("short")?.height ?? 0));
  assert.ok((sizes.get("root")?.width ?? 0) >= 240);
});

test("a wide node in one List branch does not widen another branch", () => {
  const { nodes, edges } = fixture();
  nodes.push(
    {
      id: "other",
      type: "shape",
      position: { x: 0, y: 300 },
      data: { text: "Other", shapeType: "rounded", parentId: "root", childOrder: ["other-child"] },
    },
    {
      id: "other-child",
      type: "shape",
      position: { x: 0, y: 400 },
      data: { text: "Tiny", shapeType: "rounded", parentId: "other" },
    }
  );
  (nodes[0].data as Record<string, unknown>).childOrder = ["short", "long", "other"];
  edges.push(
    { id: "root-other", source: "root", target: "other" },
    { id: "other-child-edge", source: "other", target: "other-child" }
  );
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "list", "forest");
  const sizes = computeLayoutNodeSizes(styled.nodes, hierarchy, "root", "list");

  assert.ok((sizes.get("long")?.width ?? 0) > (sizes.get("other-child")?.width ?? 0));
});

test("an explicit typography override wins over generated layout text size", () => {
  const { nodes, edges } = fixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "horizontal", "ocean");
  const data = {
    ...(styled.nodes[1].data as Record<string, unknown>),
    fontSize: 22,
    layoutAutoTypography: false,
  };
  assert.equal(resolveLayoutFontSize(data), 22);
});

test("generated typography never shrinks an existing larger font size", () => {
  const { nodes, edges } = fixture();
  nodes[1] = {
    ...nodes[1],
    data: { ...nodes[1].data, fontSize: 30 },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "matrix", "ocean");
  const data = styled.nodes[1].data as Record<string, unknown>;

  assert.equal(resolveLayoutFontSize(data), 30);
});

test("structured layouts respect fixed and keep-width manual sizing modes", () => {
  const { nodes, edges } = fixture();
  nodes[1] = {
    ...nodes[1],
    data: {
      ...nodes[1].data,
      autoSizeMode: "fixed",
      userSize: { width: 310, height: 96 },
    },
  };
  nodes[2] = {
    ...nodes[2],
    data: {
      ...nodes[2].data,
      autoSizeMode: "height-only",
      userSize: { width: 360, height: 80 },
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const sizes = computeLayoutNodeSizes(nodes, hierarchy, "root", "horizontal");

  assert.deepEqual(sizes.get("short"), { width: 310, height: 96 });
  assert.equal(sizes.get("long")?.width, 360);
  assert.ok((sizes.get("long")?.height ?? 0) >= 64);
});
