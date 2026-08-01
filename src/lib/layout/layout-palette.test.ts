import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import type { LayoutMode } from "../types";
import { buildHierarchy } from "./hierarchy";
import {
  applyLayoutPalette,
  buildLayoutVisualStyles,
  layoutBorderWidthFor,
  resetDescendantLayoutFillOverrides,
  supportsAutomaticLayoutColors,
} from "./layout-palette";
import {
  RADIAL_COLOR_SCHEMES,
  automaticLayoutBorderColor,
  automaticLayoutTextColor,
  layoutBranchAnchorColor,
  layoutTextTreatment,
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

test("automatic text treatment defaults to fill contrast and supports hierarchy colors", () => {
  assert.equal(layoutTextTreatment(undefined), "contrast");
  assert.equal(layoutTextTreatment("unsupported"), "contrast");
  assert.equal(layoutTextTreatment("hierarchy"), "hierarchy");
  assert.equal(layoutTextTreatment("uniform-dark"), "uniform-dark");
  assert.equal(layoutTextTreatment("uniform-light"), "uniform-light");
  assert.equal(
    automaticLayoutTextColor("#ffffff", "#bf4059", "contrast", 1),
    "#ffffff"
  );
  assert.equal(
    automaticLayoutTextColor("#111827", "not-a-color", "hierarchy", 1),
    "#111827"
  );
  assert.match(
    automaticLayoutTextColor("#ffffff", "#bf4059", "hierarchy", 1),
    /^color-mix\(in srgb, hsl\(348\.\d, 49\.\d%, 50\.0%\) 62%, var\(--foreground\)\)$/
  );
  assert.equal(
    automaticLayoutTextColor("#ffffff", "#bf4059", "uniform-dark", 1),
    "#020617"
  );
  assert.equal(
    automaticLayoutTextColor("#020617", "#bf4059", "uniform-light", 2),
    "#ffffff"
  );
  assert.equal(
    automaticLayoutTextColor("#fffaf2", "#bf4059", "uniform-dark", 0),
    "#fffaf2"
  );
});

test("hierarchy text colors separate branches while descendants retain their branch hue", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const baseline = buildLayoutVisualStyles("root", hierarchy, "list", "spectrum", nodes);
  const configuredNodes = nodes.map((node) => node.id === "root"
    ? {
        ...node,
        data: {
          ...node.data,
          layoutTextTreatment: "hierarchy",
        },
      }
    : node);
  const styles = buildLayoutVisualStyles(
    "root",
    hierarchy,
    "list",
    "spectrum",
    configuredNodes
  );
  const hierarchyHue = (nodeId: string) => {
    const color = styles.get(nodeId)?.textColor ?? "";
    const match = color.match(/hsl\(([\d.]+),/);
    assert.ok(match, `${nodeId} should use a hierarchy text color`);
    return Number.parseFloat(match[1]);
  };

  assert.equal(styles.get("branch-a")?.fillColor, baseline.get("branch-a")?.fillColor);
  assert.equal(styles.get("a-1")?.fillColor, baseline.get("a-1")?.fillColor);
  assert.equal(hierarchyHue("branch-a"), hierarchyHue("a-1"));
  assert.notEqual(hierarchyHue("branch-a"), hierarchyHue("branch-b"));
  assert.match(styles.get("root")?.textColor ?? "", /^color-mix\(/);
});

test("uniform text treatments keep the root contrasting and make every descendant consistent", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const darkNodes = nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutTextTreatment: "uniform-dark" } }
    : node);
  const lightNodes = nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutTextTreatment: "uniform-light" } }
    : node);
  const darkStyles = buildLayoutVisualStyles("root", hierarchy, "list", "spectrum", darkNodes);
  const lightStyles = buildLayoutVisualStyles("root", hierarchy, "list", "spectrum", lightNodes);

  assert.equal(darkStyles.get("root")?.textColor, "#ffffff");
  assert.equal(lightStyles.get("root")?.textColor, "#ffffff");
  for (const nodeId of ["branch-a", "a-1", "a-1-child", "a-2", "branch-b", "b-1"]) {
    assert.equal(darkStyles.get(nodeId)?.textColor, "#020617");
    assert.equal(lightStyles.get(nodeId)?.textColor, "#ffffff");
  }
});

test("a manual empty fill remains independent from automatic hierarchy text", () => {
  const { nodes, edges } = hierarchyFixture();
  const configuredNodes = nodes.map((node) => {
    if (node.id === "root") {
      return {
        ...node,
        data: {
          ...node.data,
          layoutTextTreatment: "hierarchy",
        },
      };
    }
    if (node.id === "branch-a") {
      return {
        ...node,
        data: {
          ...node.data,
          fillColor: "transparent",
          layoutAutoFill: false,
        },
      };
    }
    return node;
  });
  const hierarchy = buildHierarchy(configuredNodes, edges);
  const result = applyLayoutPalette(
    configuredNodes,
    edges,
    hierarchy,
    "root",
    "list",
    "spectrum"
  );
  const childData = result.nodes.find((node) => node.id === "branch-a")!.data as Record<string, unknown>;
  const visualStyle = childData.layoutVisualStyle as { textColor: string };

  assert.equal(childData.fillColor, "transparent");
  assert.equal(childData.layoutAutoFill, false);
  assert.notEqual(childData.layoutAutoText, false);
  assert.match(visualStyle.textColor, /^color-mix\(/);
});

test("automatic border treatments change contrast without changing widths", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const baseline = buildLayoutVisualStyles("root", hierarchy, "list", "spectrum", nodes);
  const configuredNodes = nodes.map((node) => node.id === "root"
    ? {
        ...node,
        data: {
          ...node.data,
          layoutBorderTreatment: "hierarchy",
          layoutBorderStyle: "dashed",
        },
      }
    : node);
  const hierarchyStyles = buildLayoutVisualStyles(
    "root",
    hierarchy,
    "list",
    "spectrum",
    configuredNodes
  );

  for (const nodeId of ["root", "branch-a", "a-1", "a-1-child"]) {
    assert.equal(
      hierarchyStyles.get(nodeId)?.borderWidth,
      baseline.get(nodeId)?.borderWidth,
      `${nodeId} border width should remain fixed`
    );
    assert.equal(hierarchyStyles.get(nodeId)?.borderStyle, "dashed");
  }
  assert.notEqual(
    hierarchyStyles.get("branch-a")?.borderColor,
    hierarchyStyles.get("a-1-child")?.borderColor
  );
});

test("chart border thickness is visible outside Matrix while Matrix reserves it for the shared grid", () => {
  assert.equal(layoutBorderWidthFor("list", 0), 2.5);
  assert.equal(layoutBorderWidthFor("list", 2), 1.5);
  assert.equal(layoutBorderWidthFor("list", 2, 3), 3);
  assert.equal(layoutBorderWidthFor("matrix", 0, 3), 0);

  const { nodes, edges } = hierarchyFixture();
  const configuredNodes = nodes.map((node) => node.id === "root"
    ? {
        ...node,
        data: {
          ...node.data,
          layoutBorderWidth: 3,
        },
      }
    : node);
  const hierarchy = buildHierarchy(configuredNodes, edges);
  const styles = buildLayoutVisualStyles(
    "root",
    hierarchy,
    "list",
    "spectrum",
    configuredNodes
  );

  assert.equal(styles.get("root")?.borderWidth, 3);
  assert.equal(styles.get("branch-a")?.borderWidth, 3);
  assert.equal(styles.get("a-1")?.borderWidth, 3);
});

test("automatic border treatment choices cover coordinated, soft, neutral, and none", () => {
  const fill = "hsl(210.0, 40.0%, 64.0%)";
  const coordinated = "hsla(210.0, 30.0%, 46.0%, 0.62)";

  assert.equal(
    automaticLayoutBorderColor(fill, coordinated, "coordinated", 1),
    coordinated
  );
  assert.match(
    automaticLayoutBorderColor(fill, coordinated, "soft", 2),
    /0\.38\)$/
  );
  assert.equal(
    automaticLayoutBorderColor(fill, coordinated, "neutral", 2),
    "hsla(222.0, 47.0%, 11.0%, 0.34)"
  );
  assert.equal(
    automaticLayoutBorderColor(fill, coordinated, "none", 2),
    "transparent"
  );
});

test("borderless automatic nodes retain connector accent colors", () => {
  const { nodes, edges } = hierarchyFixture();
  const configuredNodes = nodes.map((node) => node.id === "root"
    ? {
        ...node,
        data: { ...node.data, layoutBorderTreatment: "none" },
      }
    : node);
  const hierarchy = buildHierarchy(configuredNodes, edges);
  const styles = buildLayoutVisualStyles(
    "root",
    hierarchy,
    "list",
    "spectrum",
    configuredNodes
  );

  assert.equal(styles.get("branch-a")?.borderColor, "transparent");
  assert.notEqual(styles.get("branch-a")?.accentColor, "transparent");
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

test("an outer List palette preserves a nested Matrix presentation", () => {
  const { nodes, edges } = hierarchyFixture();
  const matrixIds = new Set(["branch-a", "a-1", "a-1-child", "a-2"]);
  const matrixNodes = nodes.map((node) => matrixIds.has(node.id)
    ? {
        ...node,
        data: {
          ...node.data,
          ...(node.id === "branch-a" ? { layoutMode: "matrix" } : {}),
          layoutVisualStyle: {
            rootId: "branch-a",
            mode: "matrix",
            scheme: "ocean",
            depth: node.id === "branch-a" ? 0 : 1,
            branchIndex: 0,
            fillColor: "#aabbcc",
            borderColor: "#223344",
            textColor: "#112233",
            accentColor: "#223344",
            borderWidth: 0,
            borderStyle: "solid",
            fontSize: 17,
          },
        },
      }
    : node);
  const hierarchy = buildHierarchy(matrixNodes, edges);
  const result = applyLayoutPalette(matrixNodes, edges, hierarchy, "root", "list", "forest");

  for (const nodeId of matrixIds) {
    const before = matrixNodes.find((node) => node.id === nodeId)!.data as Record<string, unknown>;
    const after = result.nodes.find((node) => node.id === nodeId)!.data as Record<string, unknown>;
    assert.deepEqual(after.layoutVisualStyle, before.layoutVisualStyle);
  }
  const otherStyle = (
    result.nodes.find((node) => node.id === "branch-b")!.data as Record<string, unknown>
  ).layoutVisualStyle as { rootId: string; mode: string };
  assert.deepEqual(
    { rootId: otherStyle.rootId, mode: otherStyle.mode },
    { rootId: "root", mode: "list" }
  );
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

function matrixRowsFixture(
  rowCount: number,
  rootData: Record<string, unknown> = {}
): { nodes: Node[]; edges: Edge[]; rowIds: string[] } {
  const rowIds = Array.from({ length: rowCount }, (_, index) => `row-${index}`);
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 0, y: 0 },
      data: { text: "root", childOrder: rowIds, layoutMode: "matrix", ...rootData },
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
  return { nodes, edges, rowIds };
}

test("Matrix rows flow continuously through the palette without wrapping", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(16);
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum");
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));
  const steps = hues.slice(1).map((hue, index) => clockwiseHueDistance(hues[index], hue));

  assert.ok(steps.every((step) => step > 0 && step <= 32));
  assert.ok(clockwiseHueDistance(hues[0], hues.at(-1)!) > 300);
  assert.notEqual(hues[0], hues.at(-1));
});

test("Gentle Matrix row colors stay within one analogous hue range", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(12, {
    matrixRowColorPattern: "gentle",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));
  const totalTravel = clockwiseHueDistance(hues[0], hues.at(-1)!);
  const steps = hues.slice(1).map((hue, index) => clockwiseHueDistance(hues[index], hue));

  assert.ok(totalTravel > 0 && totalTravel <= 56);
  assert.ok(steps.every((step) => step > 0 && step < 8));
});

test("Two-color Matrix rows blend between the selected endpoints", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(5, {
    matrixRowColorPattern: "duotone",
    layoutStartColor: "#ff0000",
    matrixRowEndColor: "#0000ff",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));

  assert.deepEqual(hues, [0, 330, 300, 270, 240]);
});

test("Alternating Matrix rows repeat exactly two selected hues", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(6, {
    matrixRowColorPattern: "alternating",
    layoutStartColor: "#ff0000",
    matrixRowEndColor: "#0000ff",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));

  assert.deepEqual(hues, [0, 240, 0, 240, 0, 240]);
});

test("Alternating Matrix rows preserve metallic endpoints on their matching rows", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(6, {
    matrixRowColorPattern: "alternating",
    layoutStartColor: "#ff0000",
    matrixRowEndColor: "#d4af37",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);

  assert.deepEqual(
    rowIds.map((id) => styles.get(id)!.surfaceEffect),
    [undefined, "metallic", undefined, "metallic", undefined, "metallic"]
  );
  assert.deepEqual(
    rowIds.map((id) => styles.get(id)!.surfaceEffectStrength),
    [undefined, 72, undefined, 72, undefined, 72]
  );
});

test("Two-color Matrix rows blend metallic intensity between endpoint materials", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(5, {
    matrixRowColorPattern: "duotone",
    layoutStartColor: "#ff0000",
    matrixRowEndColor: "#d4af37",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);

  assert.deepEqual(
    rowIds.map((id) => styles.get(id)!.surfaceEffectStrength),
    [undefined, 18, 36, 54, 72]
  );
});

test("Metallic Matrix start colors carry their surface through flowing row hues", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(4, {
    matrixRowColorPattern: "gentle",
    layoutStartColor: "#c0c0c0",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);

  assert.deepEqual(
    rowIds.map((id) => styles.get(id)!.surfaceEffect),
    ["metallic", "metallic", "metallic", "metallic"]
  );
  assert.equal(styles.get("root")!.surfaceEffect, undefined);
});

test("Curated Matrix rows use and repeat the selected palette swatches", () => {
  const scheme = RADIAL_COLOR_SCHEMES[0];
  const { nodes, edges, rowIds } = matrixRowsFixture(scheme.hues.length + 2, {
    matrixRowColorPattern: "curated",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", scheme.id, nodes);
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));

  assert.deepEqual(hues.slice(0, scheme.hues.length), scheme.hues);
  assert.deepEqual(hues.slice(scheme.hues.length), scheme.hues.slice(0, 2));
});

test("Sectioned Palette holds one hue across each neighboring branch group", () => {
  const { nodes, edges, rowIds } = matrixRowsFixture(8, {
    layoutColorPattern: "sectioned",
    layoutStartColor: "#ff0000",
    layoutEndColor: "#0000ff",
  });
  const hierarchy = buildHierarchy(nodes, edges);
  const styles = buildLayoutVisualStyles("root", hierarchy, "matrix", "spectrum", nodes);
  const hues = rowIds.map((id) => hueFromHsl(styles.get(id)!.fillColor));

  assert.deepEqual(hues, [0, 0, 320, 320, 280, 280, 240, 240]);
});

test("every node-based layout supports the same branch color patterns", () => {
  const modes: LayoutMode[] = [
    "freeForm",
    "fromParentFreeForm",
    "horizontal",
    "vertical",
    "list",
    "topDown",
    "linear",
    "matrix",
  ];

  for (const mode of modes) {
    const { nodes, edges } = hierarchyFixture();
    const configuredNodes = nodes.map((node) => node.id === "root"
      ? {
          ...node,
          data: {
            ...node.data,
            layoutMode: mode,
            layoutColorPattern: "alternating",
            layoutStartColor: "#ff0000",
            layoutEndColor: "#0000ff",
            layoutBorderTreatment: "none",
            layoutBorderStyle: "dotted",
          },
        }
      : node);
    const hierarchy = buildHierarchy(configuredNodes, edges);
    const styles = buildLayoutVisualStyles(
      "root",
      hierarchy,
      mode,
      "spectrum",
      configuredNodes
    );

    assert.equal(supportsAutomaticLayoutColors(mode), true);
    assert.equal(hueFromHsl(styles.get("branch-a")!.fillColor), 0);
    assert.equal(hueFromHsl(styles.get("branch-b")!.fillColor), 240);
    for (const style of styles.values()) {
      assert.equal(style.borderColor, "transparent", `${mode} should support borderless`);
      assert.equal(style.borderStyle, "dotted", `${mode} should support dotted borders`);
    }
  }
});

test("Radial uses the same Sectioned Palette branch anchors", () => {
  const scheme = RADIAL_COLOR_SCHEMES[0];
  const hues = Array.from({ length: 8 }, (_, branchIndex) => hueFromHsl(
    layoutBranchAnchorColor(
      scheme,
      branchIndex,
      8,
      "#ff0000",
      "sectioned",
      "#0000ff",
      scheme.lightness
    )
  ));

  assert.deepEqual(hues, [0, 0, 320, 320, 280, 280, 240, 240]);
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

test("a custom Matrix start color rotates the row flow and persists on the root", () => {
  const { nodes, edges } = hierarchyFixture();
  nodes[0] = {
    ...nodes[0],
    data: {
      ...nodes[0].data,
      layoutMode: "matrix",
      layoutStartColor: "#3b82f6",
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "matrix", "spectrum");
  const rootData = styled.nodes.find((node) => node.id === "root")!.data as Record<string, unknown>;
  const rootStyle = rootData.layoutVisualStyle as { fillGradient?: string; textColor: string };
  const firstRowStyle = (
    styled.nodes.find((node) => node.id === "branch-a")!.data as Record<string, unknown>
  ).layoutVisualStyle as { fillColor: string; textColor: string };
  const firstHue = hueFromHsl(firstRowStyle.fillColor);

  assert.equal(rootData.layoutStartColor, "#3b82f6");
  assert.match(rootStyle.fillGradient ?? "", /^linear-gradient\(100deg,/);
  assert.equal(rootStyle.textColor, "#ffffff");
  assert.ok(firstHue >= 216 && firstHue <= 218);
  assert.equal(firstRowStyle.textColor, "#020617");
});

test("neutral Matrix start colors remain neutral while descendants lighten", () => {
  const scheme = RADIAL_COLOR_SCHEMES[0];
  const anchor = matrixRowAnchorColor(scheme, 0, 4, "#808080");
  const parent = radialSectorColors(scheme, 0, 1, 0, 1, anchor);
  const child = radialSectorColors(scheme, 0, 2, 0, 1, anchor);

  assert.match(parent.fill, /^hsl\([\d.]+, 0\.0%, 64\.0%\)$/);
  assert.match(child.fill, /^hsl\([\d.]+, 0\.0%, 68\.0%\)$/);
  assert.equal(parent.text, "#020617");
  assert.equal(child.text, "#020617");
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
  for (const pattern of ["flow", "gentle", "duotone", "alternating", "curated", "sectioned"] as const) {
    for (const scheme of RADIAL_COLOR_SCHEMES) {
      for (let branchIndex = 0; branchIndex < 16; branchIndex += 1) {
        const anchor = matrixRowAnchorColor(scheme, branchIndex, 16, undefined, pattern);
        for (let depth = 1; depth <= 12; depth += 1) {
          const colors = radialSectorColors(scheme, branchIndex, depth, 0, 1, anchor);
          assert.equal(
            colors.text,
            "#020617",
            `${scheme.label} ${pattern} row ${branchIndex} depth ${depth} should use dark text`
          );
          assert.ok(
            colorContrast(colors.fill, colors.text) >= 4.5,
            `${scheme.label} ${pattern} row ${branchIndex} depth ${depth} needs readable dark text`
          );
        }
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

test("a chart border setting reclaims descendant borders without resetting fill or text", () => {
  const { nodes, edges } = hierarchyFixture();
  const overriddenNodes = nodes.map((node) => ["branch-a", "a-1", "a-1-child"].includes(node.id)
    ? {
        ...node,
        data: {
          ...node.data,
          layoutAutoBorder: false,
          layoutAutoFill: false,
          layoutAutoText: false,
        },
      }
    : node);
  const hierarchy = buildHierarchy(overriddenNodes, edges);
  const styled = applyLayoutPalette(
    overriddenNodes,
    edges,
    hierarchy,
    "root",
    "list",
    "forest",
    { resetBorderOverrides: true }
  );

  for (const nodeId of ["branch-a", "a-1", "a-1-child"]) {
    const data = styled.nodes.find((node) => node.id === nodeId)!.data as Record<string, unknown>;
    assert.equal(data.layoutAutoBorder, undefined, `${nodeId} should return to automatic borders`);
    assert.equal(data.layoutAutoFill, false, `${nodeId} fill should remain manual`);
    assert.equal(data.layoutAutoText, false, `${nodeId} text should remain manual`);
  }
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

test("Free Form keeps automatic colors without moving the diagram", () => {
  const { nodes, edges } = hierarchyFixture();
  const hierarchy = buildHierarchy(nodes, edges);
  const styled = applyLayoutPalette(nodes, edges, hierarchy, "root", "horizontal", "lotus");
  const freeForm = applyLayoutPalette(styled.nodes, styled.edges, hierarchy, "root", "freeForm", "lotus");
  const childData = freeForm.nodes[1].data as Record<string, unknown>;
  const edgeData = freeForm.edges[0].data as Record<string, unknown>;
  const childStyle = childData.layoutVisualStyle as { mode: string; fillColor: string };

  assert.equal(childStyle.mode, "freeForm");
  assert.match(childStyle.fillColor, /^hsl\(/);
  assert.equal(childData.fillColor, "#ffffff");
  assert.equal(typeof edgeData.layoutColor, "string");
  assert.equal(edgeData.layoutColorRootId, "root");
  assert.equal(edgeData.layoutOriginalMarkerColor, "#123456");
  assert.deepEqual(
    freeForm.nodes.map((node) => node.position),
    nodes.map((node) => node.position)
  );
});
