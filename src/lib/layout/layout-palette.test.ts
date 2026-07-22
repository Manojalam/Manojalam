import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import { applyLayoutPalette, buildLayoutVisualStyles } from "./layout-palette";

function hierarchyFixture(): { nodes: Node[]; edges: Edge[] } {
  const specs = [
    { id: "root", parentId: null },
    { id: "branch-a", parentId: "root" },
    { id: "a-1", parentId: "branch-a" },
    { id: "a-1-child", parentId: "a-1" },
    { id: "a-2", parentId: "branch-a" },
    { id: "branch-b", parentId: "root" },
    { id: "b-1", parentId: "branch-b" },
  ];
  const childOrder = new Map<string, string[]>();
  for (const spec of specs) {
    if (spec.parentId) childOrder.set(spec.parentId, [...(childOrder.get(spec.parentId) ?? []), spec.id]);
  }
  const nodes = specs.map<Node>((spec, index) => ({
    id: spec.id,
    type: "shape",
    position: { x: index * 20, y: index * 12 },
    data: {
      text: spec.id,
      fillColor: "#ffffff",
      borderColor: "#111827",
      textColor: "#111827",
      parentId: spec.parentId,
      childOrder: childOrder.get(spec.id) ?? [],
      ...(spec.id === "root" ? { layoutMode: "list" } : {}),
    },
  }));
  const edges = specs
    .filter((spec): spec is { id: string; parentId: string } => spec.parentId !== null)
    .map<Edge>((spec) => ({
      id: `edge-${spec.parentId}-${spec.id}`,
      source: spec.parentId,
      target: spec.id,
      type: "branch",
      markerEnd: { type: "arrowclosed", color: "#123456" },
      data: { layoutMode: "list" },
    }));
  return { nodes, edges };
}

test("hierarchy colors keep descendants related while separating root branches", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "list", "spectrum");

  assert.equal(styles.get("root")?.branchIndex, -1);
  assert.equal(styles.get("root")?.fillColor, "#563015");
  assert.equal(styles.get("branch-a")?.branchIndex, 0);
  assert.equal(styles.get("a-1")?.branchIndex, 0);
  assert.equal(styles.get("branch-b")?.branchIndex, 1);
  assert.notEqual(styles.get("branch-a")?.fillColor, styles.get("branch-b")?.fillColor);
  assert.notEqual(styles.get("a-1")?.fillColor, styles.get("a-2")?.fillColor);
  assert.equal(styles.get("a-1")?.depth, 2);
  assert.equal(styles.get("root")?.fontSize, 22);
  assert.equal(styles.get("branch-a")?.fontSize, 19);
  assert.ok((styles.get("a-1")?.fontSize ?? 0) >= 17);
  assert.ok((styles.get("root")?.borderWidth ?? 0) > (styles.get("a-1")?.borderWidth ?? 0));
});

test("applying a palette preserves original style fields and colors hierarchy edges", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const result = applyLayoutPalette(nodes, edges, hierarchy, "root", "matrix", "ocean");
  const rootData = result.nodes.find((node) => node.id === "root")!.data as Record<string, unknown>;
  const childData = result.nodes.find((node) => node.id === "branch-a")!.data as Record<string, unknown>;
  const firstEdgeData = result.edges[0].data as Record<string, unknown>;

  assert.equal(rootData.fillColor, "#ffffff");
  assert.equal(rootData.layoutColorScheme, "ocean");
  assert.equal((rootData.layoutVisualStyle as { fillColor: string }).fillColor, "#0c4a6e");
  assert.equal((childData.layoutVisualStyle as { rootId: string }).rootId, "root");
  assert.equal(firstEdgeData.layoutColorRootId, "root");
  assert.equal(typeof firstEdgeData.layoutColor, "string");
  assert.equal(firstEdgeData.layoutOriginalMarkerColor, "#123456");
  assert.notEqual((result.edges[0].markerEnd as { color?: string }).color, "#123456");
});

test("manual surface overrides survive palette changes and can be reset", () => {
  const { nodes, edges } = hierarchyFixture();
  nodes[2] = {
    ...nodes[2],
    data: {
      ...nodes[2].data,
      layoutAutoFill: false,
      layoutAutoText: false,
      layoutAutoTypography: false,
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const preserved = applyLayoutPalette(nodes, edges, hierarchy, "root", "list", "forest");
  const preservedData = preserved.nodes[2].data as Record<string, unknown>;
  assert.equal(preservedData.layoutAutoFill, false);
  assert.equal(preservedData.layoutAutoText, false);
  assert.equal(preservedData.layoutAutoTypography, false);

  const reset = applyLayoutPalette(
    preserved.nodes,
    preserved.edges,
    hierarchy,
    "root",
    "list",
    "forest",
    { resetOverrides: true }
  );
  const resetData = reset.nodes[2].data as Record<string, unknown>;
  assert.equal(resetData.layoutAutoFill, undefined);
  assert.equal(resetData.layoutAutoText, undefined);
  assert.equal(resetData.layoutAutoTypography, false);
});

test("a manual parent fill anchors progressively lighter automatic descendant shades", () => {
  const { nodes, edges } = hierarchyFixture();
  const branchIndex = nodes.findIndex((node) => node.id === "branch-a");
  nodes[branchIndex] = {
    ...nodes[branchIndex],
    data: {
      ...nodes[branchIndex].data,
      fillColor: "#fef3c7",
      layoutAutoFill: false,
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "matrix", "ocean");
  const styleFor = (nodeId: string) => (
    styled.nodes.find((node) => node.id === nodeId)!.data as Record<string, unknown>
  ).layoutVisualStyle as { fillColor: string };
  const lightness = (color: string) => Number(color.match(/,\s*([\d.]+)%\)$/)?.[1]);

  const firstChild = styleFor("a-1").fillColor;
  const sibling = styleFor("a-2").fillColor;
  const grandchild = styleFor("a-1-child").fillColor;

  assert.equal(firstChild, sibling);
  assert.ok(lightness(firstChild) > 89);
  assert.ok(lightness(grandchild) > lightness(firstChild));
  assert.equal((styled.nodes[branchIndex].data as Record<string, unknown>).layoutAutoFill, false);
  assert.equal((styled.nodes[branchIndex].data as Record<string, unknown>).fillColor, "#fef3c7");
});

test("free form removes only the generated presentation layer", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "horizontal", "lotus");
  const cleared = applyLayoutPalette(styled.nodes, styled.edges, hierarchy, "root", "freeForm", "lotus");
  const childData = cleared.nodes[1].data as Record<string, unknown>;
  const edgeData = cleared.edges[0].data as Record<string, unknown>;

  assert.equal(childData.layoutVisualStyle, undefined);
  assert.equal(childData.fillColor, "#ffffff");
  assert.equal(edgeData.layoutColor, undefined);
  assert.equal(edgeData.layoutColorRootId, undefined);
  assert.equal((cleared.edges[0].markerEnd as { color?: string }).color, "#123456");
});
