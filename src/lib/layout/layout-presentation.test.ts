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

  assert.equal(resolveLayoutFontSize(rootData), 18);
  assert.equal(resolveLayoutFontSize(childData), 16);
  assert.ok((resolveLayoutFontSize(childData) ?? 0) >= 14);
});

test("List uses uniform column widths while allowing long text to increase row height", () => {
  const { nodes, edges } = fixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "list", "forest");
  const sizes = computeLayoutNodeSizes(styled.nodes, hierarchy, "root", "list");

  assert.equal(sizes.get("short")?.width, sizes.get("long")?.width);
  assert.ok((sizes.get("long")?.height ?? 0) > (sizes.get("short")?.height ?? 0));
  assert.ok((sizes.get("root")?.width ?? 0) >= 240);
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
