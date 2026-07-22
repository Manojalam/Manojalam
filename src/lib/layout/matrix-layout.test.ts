import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import {
  MATRIX_DENSITY_SETTINGS,
  MATRIX_HEADER_MIN_WIDTH,
  MATRIX_MAX_COLUMN_WIDTH,
  buildMatrixLeafRows,
  computeMatrixLayout,
  getMatrixBaseSize,
  isMatrixHierarchyEdge,
  type MatrixLayoutResult,
} from "./matrix-layout";

type TreeNode = {
  id: string;
  parentId: string | null;
  text?: string;
  width?: number;
  height?: number;
  hidden?: boolean;
  collapsed?: boolean;
  orientation?: "horizontal" | "vertical";
};

function buildTree(specs: TreeNode[]): { nodes: Node[]; edges: Edge[] } {
  const childOrder = new Map<string, string[]>();
  specs.forEach((spec) => {
    if (spec.parentId) childOrder.set(spec.parentId, [...(childOrder.get(spec.parentId) ?? []), spec.id]);
  });
  const nodes = specs.map<Node>((spec, index) => ({
    id: spec.id,
    type: "shape",
    position: index === 0 ? { x: 300, y: 160 } : { x: index * 7, y: index * 5 },
    measured: { width: spec.width ?? 180, height: spec.height ?? 64 },
    hidden: spec.hidden,
    data: {
      text: spec.text ?? spec.id,
      parentId: spec.parentId,
      childOrder: childOrder.get(spec.id) ?? [],
      ...(spec.collapsed ? { collapsed: true } : {}),
      ...(spec.orientation ? { matrixOrientation: spec.orientation } : {}),
    },
  }));
  const edges = specs
    .filter((spec): spec is TreeNode & { parentId: string } => spec.parentId !== null)
    .map<Edge>((spec) => ({
      id: `edge-${spec.parentId}-${spec.id}`,
      source: spec.parentId,
      target: spec.id,
      type: "branch",
    }));
  return { nodes, edges };
}

function assertClean(result: MatrixLayoutResult): void {
  assert.deepEqual(result.diagnostics, {
    duplicateNodeIds: [],
    missingNodeIds: [],
    nonContiguousNodeIds: [],
    invalidNodeIds: [],
    overlapPairs: [],
  });
  const renderedIds = [result.header.nodeId, ...result.cells.map((cell) => cell.nodeId)];
  assert.equal(new Set(renderedIds).size, renderedIds.length);
  for (const cell of result.cells) {
    assert.ok(cell.width > 0 && cell.height > 0);
    assert.ok(cell.height >= cell.requiredHeight - 0.5);
  }
}

function referenceTree(): { nodes: Node[]; edges: Edge[] } {
  return buildTree([
    { id: "root", parentId: null, text: "Month/Year", width: 260, height: 72 },
    { id: "week-1", parentId: "root", text: "Week 1" },
    { id: "week-1-task-1", parentId: "week-1", text: "Task 1" },
    { id: "week-1-new", parentId: "week-1-task-1", text: "New" },
    { id: "week-1-task-2", parentId: "week-1", text: "Task 2" },
    { id: "week-1-task-3", parentId: "week-1", text: "Task 3" },
    { id: "week-2", parentId: "root", text: "Week 2" },
    { id: "week-2-task-1", parentId: "week-2", text: "Task 1" },
    { id: "week-2-task-2", parentId: "week-2", text: "Task 2" },
    { id: "week-2-task-3", parentId: "week-2", text: "Task 3" },
    { id: "week-3", parentId: "root", text: "Week 3" },
    { id: "week-3-task-1", parentId: "week-3", text: "Task 1" },
    { id: "week-3-task-2", parentId: "week-3", text: "Task 2" },
    { id: "week-3-task-3", parentId: "week-3", text: "Task 3" },
    { id: "week-4", parentId: "root", text: "Week 4" },
    { id: "week-5", parentId: "root", text: "Week 5" },
    { id: "week-5-task-1", parentId: "week-5", text: "Task 1" },
    { id: "week-5-new", parentId: "week-5-task-1", text: "New" },
    { id: "week-5-new-new", parentId: "week-5-new", text: "New New" },
    { id: "week-5-task-2", parentId: "week-5", text: "Task 2" },
  ]);
}

test("Month/Year becomes a merged hierarchy table", () => {
  const { nodes, edges } = referenceTree();
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = computeMatrixLayout("root", hierarchy, byId);
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(result.rows.length, 12);
  assert.equal(result.columnWidths.length, 4);
  assert.equal(result.header.nodeId, "root");
  assert.equal(result.header.width, result.bounds.width);
  assert.equal(cells.get("week-1")?.rowSpan, 3);
  assert.equal(cells.get("week-2")?.rowSpan, 3);
  assert.equal(cells.get("week-3")?.rowSpan, 3);
  assert.equal(cells.get("week-4")?.rowSpan, 1);
  assert.equal(cells.get("week-5")?.rowSpan, 2);

  const weekOneTaskRow = result.rows.find((row) => row.path.includes("week-1-new"));
  assert.deepEqual(weekOneTaskRow?.path, ["week-1", "week-1-task-1", "week-1-new"]);
  const weekFiveDeepRow = result.rows.find((row) => row.path.includes("week-5-new-new"));
  assert.deepEqual(weekFiveDeepRow?.path, ["week-5", "week-5-task-1", "week-5-new", "week-5-new-new"]);
  const scopeIds = new Set(["root", ...result.cells.map((cell) => cell.nodeId)]);
  assert.equal(isMatrixHierarchyEdge(edges[0], hierarchy, scopeIds), true);
  assert.equal(isMatrixHierarchyEdge({ source: "week-1-task-1", target: "week-2-task-1" }, hierarchy, scopeIds), false);
  assertClean(result);
});

test("uneven horizontal branches stretch terminal cells through later columns", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "short", parentId: "root" },
    { id: "deep-1", parentId: "root" },
    { id: "deep-2", parentId: "deep-1" },
    { id: "deep-3", parentId: "deep-2" },
    { id: "deep-4", parentId: "deep-3" },
    { id: "deep-5", parentId: "deep-4" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = computeMatrixLayout("root", hierarchy, byId);
  const short = result.cells.find((cell) => cell.nodeId === "short")!;

  assert.equal(result.rows.length, 2);
  assert.equal(result.columnWidths.length, 5);
  assert.equal(short.column, 0);
  assert.equal(short.width, result.bounds.width);
  assert.equal(short.x + short.width, result.bounds.right);
  assertClean(result);
});

test("a shallow table grows its body to the readable header width", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "A readable Matrix title" },
    { id: "only-child", parentId: "root", text: "One cell" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));

  assert.equal(result.columnWidths.length, 1);
  assert.ok(result.header.width >= MATRIX_HEADER_MIN_WIDTH);
  assert.equal(result.header.width, result.columnWidths[0]);
  assertClean(result);
});

test("long Sanskrit content reaches the width cap and increases row height", () => {
  const paragraph = "अथातो धर्मजिज्ञासा संस्कृतव्याकरणस्य विस्तीर्णविवरणम् ".repeat(18).trim();
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "व्याकरणम्" },
    { id: "category", parentId: "root", text: "प्रकरणम्" },
    { id: "detail", parentId: "category", text: paragraph },
  ]);
  nodes[2] = {
    ...nodes[2],
    data: { ...nodes[2].data, fontSize: 24 },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const detail = result.cells.find((cell) => cell.nodeId === "detail")!;

  assert.equal(detail.width, MATRIX_MAX_COLUMN_WIDTH);
  assert.ok(detail.height > MATRIX_DENSITY_SETTINGS.comfortable.minRowHeight * 3);
  assertClean(result);
});

test("collapsed and hidden descendants do not create table rows", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "collapsed", parentId: "root", collapsed: true },
    { id: "collapsed-child", parentId: "collapsed" },
    { id: "visible", parentId: "root" },
    { id: "hidden", parentId: "visible", hidden: true },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rows = buildMatrixLeafRows("root", hierarchy, byId);
  const result = computeMatrixLayout("root", hierarchy, byId);

  assert.deepEqual(rows.map((row) => row.path), [["collapsed"], ["visible"]]);
  assert.equal(result.cells.some((cell) => cell.nodeId === "collapsed-child"), false);
  assert.equal(result.cells.some((cell) => cell.nodeId === "hidden"), false);
  assertClean(result);
});

test("a 98-node hierarchy produces one cell per non-root node without overlap", () => {
  const specs: TreeNode[] = [{ id: "root", parentId: null, text: "Large table" }];
  for (let group = 0; group < 7; group++) {
    const parentId = `group-${group}`;
    specs.push({ id: parentId, parentId: "root", text: `Group ${group + 1}` });
    const leaves = group === 6 ? 12 : 13;
    for (let leaf = 0; leaf < leaves; leaf++) {
      specs.push({
        id: `${parentId}-leaf-${leaf}`,
        parentId,
        text: `विषय ${group + 1}.${leaf + 1} with readable content`,
        height: 56 + (leaf % 4) * 18,
      });
    }
  }
  assert.equal(specs.length, 98);
  const { nodes, edges } = buildTree(specs);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const positions = Object.values(result.placements).map((placement) => `${placement.x}:${placement.y}`);

  assert.equal(result.rows.length, 90);
  assert.equal(result.density, "compact");
  assert.ok(result.bounds.height < 4_700);
  assert.equal(result.cells.length, 97);
  assert.equal(Object.keys(result.placements).length, 98);
  assert.equal(new Set(positions).size, positions.length);
  for (let group = 0; group < 7; group++) {
    const expectedSpan = group === 6 ? 12 : 13;
    assert.equal(result.cells.find((cell) => cell.nodeId === `group-${group}`)?.rowSpan, expectedSpan);
  }
  assertClean(result);
});

test("Matrix cells shrink oversized free-form boxes to their content", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "Compact title", width: 900, height: 420 },
    { id: "category", parentId: "root", text: "Category", width: 720, height: 360 },
    { id: "detail", parentId: "category", text: "Short detail", width: 640, height: 320 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const detail = result.cells.find((cell) => cell.nodeId === "detail")!;

  assert.ok(result.header.height < 120);
  assert.ok(detail.height < 120);
  assert.ok(detail.width < 640);
  assertClean(result);
});

test("one long unbroken word stays in a single Matrix row", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "Title" },
    { id: "detail", parentId: "root", text: "अतिदीर्घसंस्कृतसमासपदम्".repeat(8) },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const detail = result.cells.find((cell) => cell.nodeId === "detail")!;

  assert.equal(detail.height, MATRIX_DENSITY_SETTINGS.comfortable.minRowHeight);
  assertClean(result);
});

test("Matrix overrides do not replace the stored normal node size", () => {
  const node: Node = {
    id: "cell",
    position: { x: 0, y: 0 },
    measured: { width: 600, height: 420 },
    style: { width: 600, height: 420 },
    data: {
      userSize: { width: 240, height: 96 },
      layoutSizeOverride: { mode: "matrix", width: 600, height: 420 },
    },
  };
  assert.deepEqual(getMatrixBaseSize(node), { width: 240, height: 96 });
});

test("a vertical Matrix grows hierarchy levels downward", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, orientation: "vertical" },
    { id: "group-a", parentId: "root" },
    { id: "a-1", parentId: "group-a" },
    { id: "a-2", parentId: "group-a" },
    { id: "group-b", parentId: "root" },
    { id: "b-1", parentId: "group-b" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(result.orientation, "vertical");
  assert.ok(cells.get("group-a")!.x < cells.get("group-b")!.x);
  assert.ok(cells.get("a-1")!.y > cells.get("group-a")!.y);
  assert.ok(cells.get("a-1")!.x < cells.get("a-2")!.x);
  assert.ok(result.header.y < cells.get("group-a")!.y);
  assertClean(result);
});

test("Fold continues a long Matrix branch in an adjacent vertical block", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `child-${index}`, parentId: "root" })),
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const first = result.cells.find((cell) => cell.nodeId === "child-0")!;
  const sixth = result.cells.find((cell) => cell.nodeId === "child-5")!;
  const cellGap = MATRIX_DENSITY_SETTINGS[result.density].cellGap;

  assert.equal(first.y, sixth.y);
  assert.equal(sixth.x - (first.x + first.width), cellGap + 32);
  assert.equal(result.header.width, result.bounds.width);
  assertClean(result);
});

test("a top-level Fold does not inflate a shorter section to the tallest section", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "tall", parentId: "root" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `tall-${index}`, parentId: "tall" })),
    { id: "short", parentId: "root" },
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const unfolded = computeMatrixLayout(
    "root",
    buildHierarchy(fixture.nodes, fixture.edges),
    new Map(fixture.nodes.map((node) => [node.id, node]))
  );
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const tall = cells.get("tall")!;
  const short = cells.get("short")!;

  assert.equal(tall.y, short.y);
  assert.ok(tall.height > short.requiredHeight);
  assert.equal(short.height, short.requiredHeight);
  assert.equal(result.header.x, unfolded.header.x);
  assert.equal(result.header.y, unfolded.header.y);
  assertClean(result);
});

test("a top-level vertical Fold does not inflate a shorter section to the widest section", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, orientation: "vertical" },
    { id: "wide", parentId: "root" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `wide-${index}`, parentId: "wide" })),
    { id: "short", parentId: "root" },
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const wide = cells.get("wide")!;
  const short = cells.get("short")!;

  assert.equal(wide.x, short.x);
  assert.ok(wide.width > short.width);
  assert.equal(short.width, result.columnWidths[0]);
  assertClean(result);
});

test("a nested Fold shrinks its parent to the folded child rows", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "rule", parentId: "root" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `example-${index}`, parentId: "rule" })),
    { id: "next-rule", parentId: "root" },
    { id: "next-example", parentId: "next-rule" },
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "rule"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const rule = cells.get("rule")!;
  const examples = Array.from({ length: 4 }, (_, index) => cells.get(`example-${index}`)!);
  const foldedExamplesHeight = Math.max(...examples.map((cell) => cell.y + cell.height))
    - Math.min(...examples.map((cell) => cell.y));
  const nextRule = cells.get("next-rule")!;
  const cellGap = MATRIX_DENSITY_SETTINGS[result.density].cellGap;

  assert.equal(examples[0].y, examples[2].y);
  assert.equal(examples[2].x - (examples[0].x + examples[0].width), cellGap);
  assert.equal(rule.height, foldedExamplesHeight);
  assert.equal(nextRule.y, rule.y + rule.height + cellGap);
  assertClean(result);

  const resizedNodes = nodes.map((node) => node.id === "rule"
    ? { ...node, data: { ...node.data, matrixHeightOverride: 220 } }
    : node);
  const resized = computeMatrixLayout(
    "root",
    buildHierarchy(resizedNodes, fixture.edges),
    new Map(resizedNodes.map((node) => [node.id, node]))
  );
  assert.equal(resized.cells.find((cell) => cell.nodeId === "rule")!.height, 220);
  assertClean(resized);

  const resetNodes = resizedNodes.map((node) => node.id === "rule"
    ? { ...node, data: { ...node.data, matrixHeightOverride: undefined } }
    : node);
  const reset = computeMatrixLayout(
    "root",
    buildHierarchy(resetNodes, fixture.edges),
    new Map(resetNodes.map((node) => [node.id, node]))
  );
  assert.equal(reset.cells.find((cell) => cell.nodeId === "rule")!.height, rule.height);
  assertClean(reset);
});

test("a nested vertical Fold uses the normal Matrix cell gap", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "rule", parentId: "root", orientation: "vertical" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `example-${index}`, parentId: "rule" })),
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "rule"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const first = cells.get("example-0")!;
  const third = cells.get("example-2")!;
  const cellGap = MATRIX_DENSITY_SETTINGS[result.density].cellGap;

  assert.equal(first.x, third.x);
  assert.equal(third.y - (first.y + first.height), cellGap);
  assertClean(result);
});

test("a compact nested Fold keeps the next large branch in the outer right section", () => {
  const groups = [
    ["varna", 4],
    ["yant", 4],
    ["savarna", 5],
    ["guna", 4],
    ["vrddhi", 4],
    ["purva", 2],
    ["para", 2],
  ] as const;
  const fixture = buildTree([
    { id: "root", parentId: null },
    ...groups.flatMap(([groupId, exampleCount]) => [
      { id: groupId, parentId: "root" },
      { id: `${groupId}-rule`, parentId: groupId },
      ...Array.from({ length: exampleCount }, (_, index) => ({
        id: `${groupId}-example-${index}`,
        parentId: `${groupId}-rule`,
      })),
    ]),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "root") return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    if (node.id === "varna-rule") return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(cells.get("varna")!.x, cells.get("savarna")!.x);
  assert.ok(cells.get("guna")!.x > cells.get("savarna")!.x);
  assert.equal(cells.get("guna")!.x, cells.get("para")!.x);
  assert.equal(cells.get("varna")!.y, cells.get("guna")!.y);
  assertClean(result);
});

test("balanced top-level Fold sections keep nested Matrix branches content-sized", () => {
  const groups = [
    ["varna", 4],
    ["yant", 4],
    ["savarna", 4],
    ["guna", 4],
    ["vrddhi", 4],
    ["purva", 2],
    ["para", 2],
  ] as const;
  const fixture = buildTree([
    { id: "root", parentId: null },
    ...groups.flatMap(([groupId, exampleCount]) => [
      { id: groupId, parentId: "root" },
      { id: `${groupId}-rule`, parentId: groupId },
      ...Array.from({ length: exampleCount }, (_, index) => ({
        id: `${groupId}-example-${index}`,
        parentId: `${groupId}-rule`,
      })),
    ]),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "root") return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    if (node.id.endsWith("-rule")) return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const savarna = cells.get("savarna")!;
  const guna = cells.get("guna")!;
  const savarnaExample = cells.get("savarna-example-0")!;

  assert.equal(savarna.height, guna.height);
  assert.equal(savarnaExample.height, savarnaExample.requiredHeight);
  assert.ok(cells.get("guna")!.x > savarna.x);
  assertClean(result);
});

test("user-resized cells persist column width and row height overrides", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "category", parentId: "root" },
    { id: "detail", parentId: "category", text: "Resizable detail" },
  ]);
  nodes[1] = {
    ...nodes[1],
    data: { ...nodes[1].data, matrixWidthOverride: 520, matrixHeightOverride: 150 },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const category = result.cells.find((cell) => cell.nodeId === "category")!;

  assert.equal(result.columnWidths[0], 520);
  assert.ok(category.height >= 150);
  assertClean(result);
});

test("vertical Matrix branches stretch shallow siblings to the body edge", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, orientation: "vertical" },
    { id: "short", parentId: "root" },
    { id: "deep", parentId: "root" },
    { id: "deep-child", parentId: "deep" },
    { id: "deepest", parentId: "deep-child" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(cells.get("short")!.y + cells.get("short")!.height, result.bounds.bottom);
  assert.equal(cells.get("deepest")!.y + cells.get("deepest")!.height, result.bounds.bottom);
  assertClean(result);
});

test("a child Matrix orientation overrides only its own descendants", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "vertical-branch", parentId: "root", orientation: "vertical" },
    { id: "vertical-1", parentId: "vertical-branch" },
    { id: "vertical-2", parentId: "vertical-branch" },
    { id: "vertical-2-deep", parentId: "vertical-2" },
    { id: "horizontal-branch", parentId: "root" },
    { id: "horizontal-1", parentId: "horizontal-branch" },
    { id: "horizontal-2", parentId: "horizontal-branch" },
    { id: "horizontal-2-deep", parentId: "horizontal-2" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(result.orientation, "horizontal");
  assert.ok(cells.get("vertical-1")!.y > cells.get("vertical-branch")!.y);
  assert.ok(cells.get("vertical-1")!.x < cells.get("vertical-2")!.x);
  assert.ok(cells.get("horizontal-1")!.x > cells.get("horizontal-branch")!.x);
  assert.ok(cells.get("horizontal-1")!.y < cells.get("horizontal-2")!.y);
  assert.equal(
    cells.get("vertical-1")!.y + cells.get("vertical-1")!.height,
    cells.get("vertical-2-deep")!.y + cells.get("vertical-2-deep")!.height
  );
  assert.equal(
    cells.get("horizontal-1")!.x + cells.get("horizontal-1")!.width,
    cells.get("horizontal-2-deep")!.x + cells.get("horizontal-2-deep")!.width
  );
  assertClean(result);
});
