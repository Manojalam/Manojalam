import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import {
  applyLayoutPalette,
  buildLayoutVisualStyles,
  resetDescendantLayoutFillOverrides,
} from "./layout-palette";
import {
  RADIAL_COLOR_SCHEMES,
  matrixRowAnchorColor,
  radialSectorColors,
} from "../radial-layout";

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
  assert.equal(styles.get("root")?.fillColor, "#29344f");
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
  assert.equal((rootData.layoutVisualStyle as { fillColor: string }).fillColor, "#243f56");
  assert.equal((childData.layoutVisualStyle as { rootId: string }).rootId, "root");
  assert.equal(firstEdgeData.layoutColorRootId, "root");
  assert.equal(typeof firstEdgeData.layoutColor, "string");
  assert.equal(firstEdgeData.layoutOriginalMarkerColor, "#123456");
  assert.notEqual((result.edges[0].markerEnd as { color?: string }).color, "#123456");
});

test("Matrix palette leaves shape borders to the user-controlled node style", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "forest");

  assert.ok([...styles.values()].every((style) => style.borderWidth === 0));
});

test("Matrix automatic colors use branch hues with one shade per depth", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "ocean");

  const branchAColor = styles.get("branch-a")?.fillColor;
  const branchBColor = styles.get("branch-b")?.fillColor;
  const branchAGrandchildColors = ["a-1", "a-2"].map((nodeId) => styles.get(nodeId)?.fillColor);
  const branchBGrandchildColor = styles.get("b-1")?.fillColor;
  const branchAGreatGrandchildColor = styles.get("a-1-child")?.fillColor;

  assert.notEqual(branchAColor, branchBColor);
  assert.equal(new Set(branchAGrandchildColors).size, 1);
  assert.notEqual(branchAGrandchildColors[0], branchBGrandchildColor);
  assert.notEqual(branchAColor, branchAGrandchildColors[0]);
  assert.notEqual(branchAGrandchildColors[0], branchAGreatGrandchildColor);
});

function hueFromHsl(color: string): number {
  const hue = color.match(/^hsl\(([\d.]+),/)?.[1];
  assert.ok(hue, `Expected an HSL color, received ${color}`);
  return Number(hue);
}

function clockwiseHueDistance(from: number, to: number): number {
  return ((to - from) % 360 + 360) % 360;
}

test("Matrix rows flow continuously through the palette without wrapping", () => {
  const rowCount = 16;
  const rowIds = Array.from({ length: rowCount }, (_, index) => `row-${index}`);
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 0, y: 0 },
      data: { text: "root", childOrder: rowIds, layoutMode: "matrix" },
    },
    ...rowIds.map((id, index) => ({
      id,
      type: "shape",
      position: { x: 0, y: index * 50 },
      data: { text: id, parentId: "root", childOrder: [] },
    })),
  ];
  const edges: Edge[] = rowIds.map((id) => ({
    id: `edge-root-${id}`,
    source: "root",
    target: id,
    type: "branch",
  }));
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum");
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));
  const steps = hues.slice(1).map((hue, index) => clockwiseHueDistance(hues[index], hue));

  assert.ok(steps.every((step) => step > 0 && step <= 32));
  assert.ok(clockwiseHueDistance(hues[0], hues.at(-1)!) > 300);
  assert.notEqual(hues[0], hues.at(-1));
});

test("short Matrix palettes stop before neighboring rows make a large hue jump", () => {
  for (const scheme of RADIAL_COLOR_SCHEMES) {
    const first = hueFromHsl(matrixRowAnchorColor(scheme, 0, 3));
    const second = hueFromHsl(matrixRowAnchorColor(scheme, 1, 3));
    const third = hueFromHsl(matrixRowAnchorColor(scheme, 2, 3));
    const direction = Math.sign(scheme.matrixHueRange[1] - scheme.matrixHueRange[0]);
    const distance = (from: number, to: number) => direction >= 0
      ? clockwiseHueDistance(from, to)
      : clockwiseHueDistance(to, from);

    assert.ok(distance(first, second) <= 32, `${scheme.label} row 1 to 2 should flow`);
    assert.ok(distance(second, third) <= 32, `${scheme.label} row 2 to 3 should flow`);
  }
});

function colorChannels(color: string): [number, number, number] {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [0, 2, 4].map((offset) => (
      Number.parseInt(hex[1].slice(offset, offset + 2), 16) / 255
    )) as [number, number, number];
  }
  const hsl = color.match(/^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
  assert.ok(hsl, `Expected a hex or HSL color, received ${color}`);
  const hue = Number(hsl[1]) / 60;
  const saturation = Number(hsl[2]) / 100;
  const lightness = Number(hsl[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
  const [red, green, blue] = hue < 1 ? [chroma, secondary, 0]
    : hue < 2 ? [secondary, chroma, 0]
      : hue < 3 ? [0, chroma, secondary]
        : hue < 4 ? [0, secondary, chroma]
          : hue < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return [red + match, green + match, blue + match];
}

function colorLuminance(color: string): number {
  const channels = colorChannels(color).map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorContrast(first: string, second: string): number {
  const luminances = [colorLuminance(first), colorLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

test("Matrix rows keep one readable dark text color across every palette and depth", () => {
  for (const scheme of RADIAL_COLOR_SCHEMES) {
    for (let branchIndex = 0; branchIndex < 16; branchIndex += 1) {
      const anchor = matrixRowAnchorColor(scheme, branchIndex, 16);
      for (let depth = 1; depth <= 12; depth += 1) {
        const colors = radialSectorColors(scheme, branchIndex, depth, 0, 1, anchor);
        assert.equal(
          colors.text,
          "#020617",
          `${scheme.label} row ${branchIndex} depth ${depth} should use dark text`
        );
        assert.ok(
          colorContrast(colors.fill, colors.text) >= 4.5,
          `${scheme.label} row ${branchIndex} depth ${depth} needs readable dark text`
        );
      }
    }
  }
});

test("automatic palette fills keep readable text through deep hierarchies", () => {
  for (const scheme of RADIAL_COLOR_SCHEMES) {
    assert.ok(scheme.saturation <= 50, `${scheme.label} should stay below highlighter saturation`);
    for (let branchIndex = 0; branchIndex < scheme.hues.length; branchIndex += 1) {
      for (let depth = 1; depth <= 12; depth += 1) {
        const colors = radialSectorColors(scheme, branchIndex, depth, 0, 1);
        assert.ok(
          colorContrast(colors.fill, colors.text) >= 4.5,
          `${scheme.label} branch ${branchIndex} depth ${depth} needs readable text`
        );
        assert.ok(
          colorContrast(colors.fillEnd, colors.text) >= 4.5,
          `${scheme.label} gradient branch ${branchIndex} depth ${depth} needs readable text`
        );
      }
    }
  }
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

test("a manual parent fill anchors one automatic shade per descendant depth", () => {
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

test("resetting descendant fills keeps the selected parent and unrelated branches manual", () => {
  const { nodes, edges } = hierarchyFixture();
  const manualNodeIds = new Set(["branch-a", "a-1", "a-1-child", "branch-b"]);
  const overriddenNodes = nodes.map((node) => manualNodeIds.has(node.id)
    ? {
        ...node,
        data: {
          ...node.data,
          fillColor: "#fef3c7",
          layoutAutoFill: false,
        },
      }
    : node);
  const hierarchy = buildHierarchy(overriddenNodes, edges);
  const reset = resetDescendantLayoutFillOverrides(overriddenNodes, hierarchy, "branch-a");
  const dataFor = (nodeId: string) => (
    reset.nodes.find((node) => node.id === nodeId)!.data as Record<string, unknown>
  );

  assert.deepEqual(reset.resetNodeIds, ["a-1", "a-1-child"]);
  assert.equal(dataFor("branch-a").layoutAutoFill, false);
  assert.equal(dataFor("a-1").layoutAutoFill, undefined);
  assert.equal(dataFor("a-1-child").layoutAutoFill, undefined);
  assert.equal(dataFor("branch-b").layoutAutoFill, false);
  assert.equal(dataFor("a-1").fillColor, "#fef3c7");

  const styled = applyLayoutPalette(reset.nodes, edges, hierarchy, "root", "matrix", "ocean");
  const styleFor = (nodeId: string) => (
    styled.nodes.find((node) => node.id === nodeId)!.data as Record<string, unknown>
  ).layoutVisualStyle as { fillColor: string };
  assert.notEqual(styleFor("a-1").fillColor, styleFor("branch-a").fillColor);
  assert.notEqual(styleFor("a-1-child").fillColor, styleFor("a-1").fillColor);
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
