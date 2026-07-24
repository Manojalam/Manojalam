import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import { getNodeRect } from "./geometry";
import { packSiblingsAfterNestedMatrix } from "./nested-matrix-spacing";
import {
  MATRIX_FRAME_RADIUS,
  matrixCellBorderRadius,
  matrixFramePadding,
} from "./matrix-presentation";
import {
  MATRIX_DENSITY_SETTINGS,
  MATRIX_HEADER_MIN_WIDTH,
  MATRIX_MAX_COLUMN_WIDTH,
  buildMatrixLeafRows,
  computeMatrixLayout,
  getMatrixBaseSize,
  isMatrixHierarchyEdge,
  matrixNodeSizeDiffersFromPlacement,
  matrixRenderedSizeChanged,
  matrixTableOverrideResetAxes,
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
  childFlow?: "row" | "column";
  packCompactGroups?: boolean;
  siblingGap?: number;
  matrixWidth?: number;
  matrixHeight?: number;
  matrixTableWidth?: number;
  matrixTableHeight?: number;
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
      ...(spec.childFlow ? { matrixChildFlow: spec.childFlow } : {}),
      ...(spec.packCompactGroups ? { matrixPackCompactGroups: true } : {}),
      ...(spec.siblingGap !== undefined ? { matrixSiblingGap: spec.siblingGap } : {}),
      ...(spec.matrixWidth ? { matrixWidthOverride: spec.matrixWidth } : {}),
      ...(spec.matrixHeight ? { matrixHeightOverride: spec.matrixHeight } : {}),
      ...(spec.matrixTableWidth ? { matrixTableWidthOverride: spec.matrixTableWidth } : {}),
      ...(spec.matrixTableHeight ? { matrixTableHeightOverride: spec.matrixTableHeight } : {}),
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

function assertMatrixBodyTiled(result: MatrixLayoutResult): void {
  const cells = result.cells;
  assert.ok(cells.length > 0);
  const cellGap = MATRIX_DENSITY_SETTINGS[result.density].cellGap;
  const tolerance = 0.5;
  const bodyLeft = Math.min(...cells.map((cell) => cell.x));
  const bodyRight = Math.max(...cells.map((cell) => cell.x + cell.width));
  const rowBoundaries = [...new Set(cells.flatMap((cell) => [cell.y, cell.y + cell.height]))]
    .sort((a, b) => a - b);

  for (let index = 0; index < rowBoundaries.length - 1; index += 1) {
    const top = rowBoundaries[index];
    const bottom = rowBoundaries[index + 1];
    // A normal horizontal cell boundary can cross only part of a merged row.
    // It is intentionally canvas-colored, but never thicker than cellGap.
    if (bottom - top <= cellGap + tolerance) continue;
    const middle = top + (bottom - top) / 2;
    const activeCells = cells
      .filter((cell) => cell.y < middle && cell.y + cell.height > middle)
      .sort((a, b) => a.x - b.x);

    assert.ok(activeCells.length, `Matrix body exposes a ${bottom - top}px horizontal background band`);

    let coveredThrough = bodyLeft;
    for (const cell of activeCells) {
      assert.ok(
        cell.x - coveredThrough <= cellGap + tolerance,
        `Matrix body exposes a ${cell.x - coveredThrough}px background block near ${cell.nodeId}`
      );
      coveredThrough = Math.max(coveredThrough, cell.x + cell.width);
    }
    assert.ok(
      bodyRight - coveredThrough <= cellGap + tolerance,
      `Matrix body exposes a ${bodyRight - coveredThrough}px trailing background block`
    );
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

test("one-letter Sanskrit children stay compact in a sideways Matrix row", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "स्वरः" },
    { id: "hrasva", parentId: "root", text: "ह्रस्वः", childFlow: "row" },
    { id: "a", parentId: "hrasva", text: "अ" },
    { id: "i", parentId: "hrasva", text: "इ" },
    { id: "u", parentId: "hrasva", text: "उ" },
    { id: "r", parentId: "hrasva", text: "ऋ" },
    { id: "l", parentId: "hrasva", text: "ऌ" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const letters = ["a", "i", "u", "r", "l"].map((id) => cells.get(id)!);
  const rowWidth = letters.at(-1)!.x + letters.at(-1)!.width - letters[0].x;

  assert.ok(letters.every((cell) => cell.width <= 130));
  assert.ok(rowWidth < 700);
  assert.ok(letters.every((cell) => cell.height <= 60));
  assertClean(result);
});

test("an opted-in Sanskrit Matrix packs compact sibling sets into rows", () => {
  const consonantGroups = [
    { id: "ka-varga", text: "कवर्गः", letters: ["क", "ख", "ग", "घ", "ङ"] },
    { id: "ca-varga", text: "चवर्गः", letters: ["च", "छ", "ज", "झ", "ञ"] },
    { id: "tta-varga", text: "टवर्गः", letters: ["ट", "ठ", "ड", "ढ", "ण"] },
    { id: "ta-varga", text: "तवर्गः", letters: ["त", "थ", "द", "ध", "न"] },
    { id: "pa-varga", text: "पवर्गः", letters: ["प", "फ", "ब", "भ", "म"] },
  ];
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "वर्णमाला", packCompactGroups: true },
    { id: "vowels", parentId: "root", text: "स्वराः" },
    { id: "short-vowels", parentId: "vowels", text: "ह्रस्वाः" },
    { id: "a", parentId: "short-vowels", text: "अ" },
    { id: "i", parentId: "short-vowels", text: "इ" },
    { id: "u", parentId: "short-vowels", text: "उ" },
    { id: "r", parentId: "short-vowels", text: "ऋ" },
    { id: "l", parentId: "short-vowels", text: "ऌ" },
    { id: "consonants", parentId: "root", text: "व्यञ्जनानि" },
    ...consonantGroups.flatMap((group) => [
      { id: group.id, parentId: "consonants", text: group.text },
      ...group.letters.map((letter, index) => ({
        id: `${group.id}-${index}`,
        parentId: group.id,
        text: letter,
      })),
    ]),
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  for (const rowIds of [
    ["a", "i", "u", "r", "l"],
    Array.from({ length: 5 }, (_, index) => `ka-varga-${index}`),
    Array.from({ length: 5 }, (_, index) => `ca-varga-${index}`),
  ]) {
    const row = rowIds.map((id) => cells.get(id)!);
    assert.ok(row.every((cell) => Math.abs(cell.y - row[0].y) < 0.5));
    for (let index = 1; index < row.length; index += 1) {
      assert.ok(row[index].x > row[index - 1].x);
    }
  }

  assert.ok(cells.get("ka-varga-0")!.y < cells.get("ca-varga-0")!.y);
  assert.ok(result.bounds.width > result.bounds.height / 2);
  assertClean(result);
});

test("a small Sanskrit Matrix keeps its existing hierarchy rows", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "स्वराः" },
    { id: "group", parentId: "root", text: "ह्रस्वाः" },
    { id: "a", parentId: "group", text: "अ" },
    { id: "i", parentId: "group", text: "इ" },
    { id: "u", parentId: "group", text: "उ" },
    { id: "r", parentId: "group", text: "ऋ" },
    { id: "l", parentId: "group", text: "ऌ" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = ["a", "i", "u", "r", "l"].map(
    (id) => result.cells.find((cell) => cell.nodeId === id)!
  );

  assert.equal(result.rows.length, 5);
  assert.ok(cells.every((cell) => Math.abs(cell.x - cells[0].x) < 0.5));
  assert.ok(cells.every((cell, index) => index === 0 || cell.y > cells[index - 1].y));
  assertClean(result);
});

test("a large Sanskrit Matrix does not change layout algorithms without opt-in", () => {
  const filler = Array.from({ length: 15 }, (_, index) => ({
    id: `filler-${index}`,
    parentId: "root",
    text: `विषयः ${index + 1}`,
  }));
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "व्याकरणम्" },
    { id: "group", parentId: "root", text: "ह्रस्वाः" },
    { id: "a", parentId: "group", text: "अ" },
    { id: "i", parentId: "group", text: "इ" },
    { id: "u", parentId: "group", text: "उ" },
    { id: "r", parentId: "group", text: "ऋ" },
    { id: "l", parentId: "group", text: "ऌ" },
    ...filler,
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = ["a", "i", "u", "r", "l"].map(
    (id) => result.cells.find((cell) => cell.nodeId === id)!
  );

  assert.equal(result.rows.length, 20);
  assert.ok(cells.every((cell) => Math.abs(cell.x - cells[0].x) < 0.5));
  assert.ok(cells.every((cell, index) => index === 0 || cell.y > cells[index - 1].y));
  assertClean(result);
});

test("Matrix presentation uses rounded cells and a density-aware group frame", () => {
  assert.equal(matrixCellBorderRadius("header"), 24);
  assert.equal(matrixCellBorderRadius("category"), 20);
  assert.equal(matrixCellBorderRadius("cell"), 18);
  assert.equal(MATRIX_FRAME_RADIUS, 22);
  assert.ok(matrixFramePadding("presentation") > matrixFramePadding("comfortable"));
  assert.ok(matrixFramePadding("comfortable") > matrixFramePadding("compact"));
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

test("a stale text measurement from another Fold width cannot inflate a new child row", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "Title" },
    { id: "branch", parentId: "root", text: "Branch" },
    { id: "first", parentId: "branch", text: "First" },
    { id: "new-child", parentId: "branch", text: "New Idea" },
    { id: "third", parentId: "branch", text: "Third" },
    { id: "fourth", parentId: "branch", text: "Fourth" },
  ]);
  nodes[1] = {
    ...nodes[1],
    data: { ...nodes[1].data, layoutFoldCount: 2 },
  };
  nodes[3] = {
    ...nodes[3],
    data: {
      ...nodes[3].data,
      matrixIntrinsicSize: {
        width: 140,
        height: 900,
        lineCount: 40,
        lineHeight: 22,
        cellWidth: 720,
      },
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const staleResult = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const staleCell = staleResult.cells.find((cell) => cell.nodeId === "new-child")!;

  assert.ok(staleCell.requiredHeight < 140);
  assertClean(staleResult);

  nodes[3] = {
    ...nodes[3],
    data: {
      ...nodes[3].data,
      matrixIntrinsicSize: {
        width: 140,
        height: 220,
        lineCount: 10,
        lineHeight: 22,
        cellWidth: staleCell.width,
      },
    },
  };
  const freshResult = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const freshCell = freshResult.cells.find((cell) => cell.nodeId === "new-child")!;

  assert.ok(
    freshCell.requiredHeight
      >= 10 * 22 + MATRIX_DENSITY_SETTINGS.comfortable.paddingY * 2
  );
  assertClean(freshResult);
});

test("invisible editor block spacing cannot inflate a measured Matrix label", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "Title" },
    {
      id: "rule",
      parentId: "root",
      text: "उपसर्गादृति धातौ ६.१.९१ - गुणापवादः\nअ (उपसर्गः) + ऋ - धातुः",
    },
  ]);
  nodes[1] = {
    ...nodes[1],
    data: {
      ...nodes[1].data,
      matrixIntrinsicSize: {
        width: 520,
        height: 260,
        lineCount: 2,
        lineHeight: 34,
        cellWidth: 560,
      },
      matrixWidthOverride: 560,
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rule = result.cells.find((cell) => cell.nodeId === "rule")!;

  assert.ok(
    rule.requiredHeight
      >= 2 * 34 + MATRIX_DENSITY_SETTINGS.comfortable.paddingY * 2
  );
  assert.ok(rule.requiredHeight < 140);
  assertClean(result);
});

test("line-based Matrix height still protects authored inline font sizes", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "Title" },
    { id: "rule", parentId: "root", text: "Large label" },
  ]);
  nodes[1] = {
    ...nodes[1],
    data: {
      ...nodes[1].data,
      richText: '<p><span style="font-size: 48px">Large</span> label</p>',
      matrixIntrinsicSize: {
        width: 260,
        height: 74,
        lineCount: 1,
        lineHeight: 24,
        cellWidth: 560,
      },
      matrixWidthOverride: 560,
    },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const rule = result.cells.find((cell) => cell.nodeId === "rule")!;

  assert.ok(
    rule.requiredHeight
      >= 48 * 1.38 + MATRIX_DENSITY_SETTINGS.comfortable.paddingY * 2
  );
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

test("Matrix detects and clears a live resize that differs from its allocated cell", () => {
  const resized: Node = {
    id: "cell",
    position: { x: 0, y: 0 },
    width: 420,
    height: 60,
    measured: { width: 420, height: 60 },
    style: { width: 420, height: 120 },
    data: {
      matrixCell: true,
      layoutSizeOverride: { mode: "matrix", width: 420, height: 120 },
    },
  };
  const reconciled: Node = {
    ...resized,
    width: undefined,
    height: undefined,
    measured: undefined,
  };

  assert.equal(matrixNodeSizeDiffersFromPlacement(resized, { width: 420, height: 120 }), true);
  assert.equal(matrixNodeSizeDiffersFromPlacement(reconciled, { width: 420, height: 120 }), false);
  assert.equal(matrixRenderedSizeChanged(resized, reconciled), true);
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
  assert.equal(sixth.x - (first.x + first.width), cellGap);
  assert.equal(result.header.width, result.bounds.width);
  assertMatrixBodyTiled(result);
  assertClean(result);
});

test("a stretched nested Fold keeps its section columns equally wide", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "red", parentId: "root" },
    { id: "red-rule", parentId: "red" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `red-example-${index}`, parentId: "red-rule" })),
    { id: "wide", parentId: "root" },
    { id: "wide-rule", parentId: "wide" },
    ...Array.from({ length: 6 }, (_, index) => ({ id: `wide-example-${index}`, parentId: "wide-rule" })),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "red-rule") return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    if (node.id === "wide-rule") return { ...node, data: { ...node.data, layoutFoldCount: 3 } };
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const firstColumn = cells.get("red-example-0")!;
  const secondColumn = cells.get("red-example-2")!;

  assert.equal(firstColumn.y, secondColumn.y);
  assert.equal(firstColumn.width, secondColumn.width);
  assertClean(result);
});

test("a stretched nested vertical Fold keeps its section rows equally tall", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, orientation: "vertical" },
    { id: "red", parentId: "root" },
    { id: "red-rule", parentId: "red" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `red-example-${index}`, parentId: "red-rule" })),
    { id: "tall", parentId: "root" },
    { id: "tall-rule", parentId: "tall" },
    ...Array.from({ length: 6 }, (_, index) => ({ id: `tall-example-${index}`, parentId: "tall-rule" })),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "red-rule") return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    if (node.id === "tall-rule") return { ...node, data: { ...node.data, layoutFoldCount: 3 } };
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const firstRow = cells.get("red-example-0")!;
  const secondRow = cells.get("red-example-2")!;

  assert.equal(firstRow.x, secondRow.x);
  assert.equal(firstRow.height, secondRow.height);
  assertClean(result);
});

test("a top-level Fold stretches a shorter section to keep the Matrix tiled", () => {
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
  assert.equal(short.height, tall.height);
  assert.ok(short.height > short.requiredHeight);
  assert.equal(result.header.x, unfolded.header.x);
  assert.equal(result.header.y, unfolded.header.y);
  assertMatrixBodyTiled(result);
  assertClean(result);
});

test("a top-level vertical Fold stretches a shorter section to keep the Matrix tiled", () => {
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
  assert.equal(short.width, wide.width);
  assert.ok(short.width > result.columnWidths[0]);
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
  assert.ok(
    resized.cells.find((cell) => cell.nodeId === "next-rule")!.y > nextRule.y,
    "growing a Matrix cell should move the following branch"
  );
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
  assert.equal(reset.cells.find((cell) => cell.nodeId === "next-rule")!.y, nextRule.y);
  assertClean(reset);
});

test("uneven Fold sections stretch through the same Matrix body edge", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "rule", parentId: "root" },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `example-${index}`,
      parentId: "rule",
    })),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "rule") {
      return { ...node, data: { ...node.data, layoutFoldCount: 2 } };
    }
    if (node.id === "example-2") {
      return { ...node, data: { ...node.data, matrixHeightOverride: 104 } };
    }
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const examples = Array.from(
    { length: 9 },
    (_, index) => result.cells.find((cell) => cell.nodeId === `example-${index}`)!
  );

  const sectionBottoms = new Map<number, number>();
  for (const example of examples) {
    sectionBottoms.set(
      example.x,
      Math.max(sectionBottoms.get(example.x) ?? Number.NEGATIVE_INFINITY, example.y + example.height)
    );
  }

  assert.equal(sectionBottoms.size, 2);
  assert.equal(new Set(sectionBottoms.values()).size, 1);
  assert.equal(examples[0].height, 104);
  assert.ok(examples[8].height > 104);
  assertMatrixBodyTiled(result);
  assertClean(result);
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

test("balanced top-level Fold sections tile nested Matrix branches without background holes", () => {
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
  assertMatrixBodyTiled(result);
  assertClean(result);
});

test("mixed nested Fold row counts tile when a wider sibling stretches the branch", () => {
  const mixedRuleCounts = [4, 2, 1, 2, 5, 6, 1] as const;
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "mixed", parentId: "root" },
    ...mixedRuleCounts.flatMap((exampleCount, ruleIndex) => [
      { id: `mixed-rule-${ruleIndex}`, parentId: "mixed" },
      ...Array.from({ length: exampleCount }, (_, exampleIndex) => ({
        id: `mixed-rule-${ruleIndex}-example-${exampleIndex}`,
        parentId: `mixed-rule-${ruleIndex}`,
      })),
    ]),
    { id: "wide", parentId: "root" },
    { id: "wide-rule", parentId: "wide" },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `wide-example-${index}`,
      parentId: "wide-rule",
    })),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id.startsWith("mixed-rule-") && !node.id.includes("-example-")) {
      const ruleIndex = Number(node.id.slice("mixed-rule-".length));
      return {
        ...node,
        data: { ...node.data, layoutFoldCount: mixedRuleCounts[ruleIndex] },
      };
    }
    if (node.id === "wide-rule") {
      return { ...node, data: { ...node.data, layoutFoldCount: 8 } };
    }
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));

  assertMatrixBodyTiled(result);
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

test("a row child flow keeps the parent left while placing direct children sideways", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "hrasva", parentId: "root", orientation: "horizontal", childFlow: "row" },
    { id: "a", parentId: "hrasva" },
    { id: "i", parentId: "hrasva" },
    { id: "u", parentId: "hrasva" },
    { id: "r", parentId: "hrasva" },
    { id: "l", parentId: "hrasva" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const parent = cells.get("hrasva")!;
  const children = ["a", "i", "u", "r", "l"].map((id) => cells.get(id)!);

  assert.ok(children.every((child) => child.x > parent.x + parent.width));
  assert.ok(children.every((child) => Math.abs(child.y - children[0].y) < 0.5));
  for (let index = 1; index < children.length; index += 1) {
    assert.ok(children[index].x >= children[index - 1].x + children[index - 1].width);
  }
  assertClean(result);
});

test("a parent's exact sibling gap is preserved between its direct children", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "group", parentId: "root", childFlow: "row", siblingGap: 24 },
    { id: "a", parentId: "group" },
    { id: "b", parentId: "group" },
    { id: "c", parentId: "group" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const children = ["a", "b", "c"].map((id) => cells.get(id)!);

  for (let index = 1; index < children.length; index += 1) {
    const gap = children[index].x - (children[index - 1].x + children[index - 1].width);
    assert.equal(gap, 24);
  }
  assertClean(result);
});

test("changing a sibling gap preserves overall Matrix size overrides", () => {
  assert.deepEqual(
    matrixTableOverrideResetAxes({ matrixSiblingGap: 2 }),
    { width: false, height: false }
  );
  assert.deepEqual(
    matrixTableOverrideResetAxes({ matrixWidthOverride: 310 }),
    { width: true, height: false }
  );
  assert.deepEqual(
    matrixTableOverrideResetAxes({ matrixHeightOverride: 100 }),
    { width: false, height: true }
  );
});

test("explicit Matrix cell dimensions are exact for selected leaf cells", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, childFlow: "row" },
    { id: "a", parentId: "root", matrixWidth: 148, matrixHeight: 72 },
    { id: "b", parentId: "root", matrixWidth: 196, matrixHeight: 72 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(cells.get("a")?.width, 148);
  assert.equal(cells.get("a")?.height, 72);
  assert.equal(cells.get("b")?.width, 196);
  assert.equal(cells.get("b")?.height, 72);
  assertClean(result);
});

test("peer Matrix rows share aligned tracks while preserving an exact column width", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "group", parentId: "root", childFlow: "column" },
    { id: "row-a", parentId: "group", childFlow: "row" },
    { id: "a-1", parentId: "row-a", matrixWidth: 220 },
    { id: "a-2", parentId: "row-a", text: "A much longer automatic label" },
    { id: "row-b", parentId: "group", childFlow: "row" },
    { id: "b-1", parentId: "row-b" },
    { id: "b-2", parentId: "row-b", text: "B" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(cells.get("row-a")?.x, cells.get("row-b")?.x);
  assert.equal(cells.get("row-a")?.width, cells.get("row-b")?.width);
  assert.equal(cells.get("a-1")?.x, cells.get("b-1")?.x);
  assert.equal(cells.get("a-1")?.width, 220);
  assert.equal(cells.get("b-1")?.width, 220);
  assert.equal(cells.get("a-2")?.x, cells.get("b-2")?.x);
  assert.equal(cells.get("a-2")?.width, cells.get("b-2")?.width);
  assertClean(result);
});

test("overall Matrix width and height overrides scale the composed table exactly", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, matrixTableWidth: 760, matrixTableHeight: 420 },
    { id: "a", parentId: "root" },
    { id: "b", parentId: "root" },
    { id: "c", parentId: "root" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));

  assert.equal(result.bounds.width, 760);
  assert.equal(result.bounds.height, 420);
  assert.equal(result.header.width, 760);
  assert.equal(result.header.y, result.bounds.top);
  assertClean(result);
});

test("a widened nested Matrix moves following outer branches without breaking their subtrees", () => {
  const nodes: Node[] = [
    {
      id: "outer",
      type: "shape",
      position: { x: 80, y: 40 },
      measured: { width: 180, height: 64 },
      data: { layoutMode: "vertical", childOrder: ["matrix", "other"] },
    },
    {
      id: "matrix",
      type: "shape",
      position: { x: 100, y: 180 },
      measured: { width: 620, height: 120 },
      data: { parentId: "outer", childOrder: ["matrix-child"], layoutMode: "matrix" },
    },
    {
      id: "matrix-child",
      type: "shape",
      position: { x: 520, y: 300 },
      measured: { width: 200, height: 80 },
      data: { parentId: "matrix", childOrder: [] },
    },
    {
      id: "other",
      type: "shape",
      position: { x: 440, y: 180 },
      measured: { width: 180, height: 72 },
      data: { parentId: "outer", childOrder: ["other-child"] },
    },
    {
      id: "other-child",
      type: "shape",
      position: { x: 470, y: 310 },
      measured: { width: 160, height: 64 },
      data: { parentId: "other", childOrder: [] },
    },
    {
      id: "unrelated",
      type: "shape",
      position: { x: 40, y: 700 },
      measured: { width: 160, height: 64 },
      data: { childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    { id: "outer-matrix", source: "outer", target: "matrix" },
    { id: "matrix-child", source: "matrix", target: "matrix-child" },
    { id: "outer-other", source: "outer", target: "other" },
    { id: "other-child", source: "other", target: "other-child" },
  ];
  const hierarchy = buildHierarchy(nodes, edges);
  const originalOther = nodes.find((node) => node.id === "other")!;
  const originalOtherChild = nodes.find((node) => node.id === "other-child")!;
  const packed = packSiblingsAfterNestedMatrix(nodes, hierarchy, "matrix");
  const packedMatrixRight = Math.max(
    getNodeRect(packed.find((node) => node.id === "matrix")!).right,
    getNodeRect(packed.find((node) => node.id === "matrix-child")!).right
  );
  const packedOther = packed.find((node) => node.id === "other")!;
  const packedOtherChild = packed.find((node) => node.id === "other-child")!;

  assert.ok(getNodeRect(packedOther).left >= packedMatrixRight + 42);
  assert.equal(
    packedOtherChild.position.x - originalOtherChild.position.x,
    packedOther.position.x - originalOther.position.x
  );
  assert.deepEqual(packed.find((node) => node.id === "unrelated")!.position, { x: 40, y: 700 });
});

test("a shrunken nested Matrix closes a stale outer-layout gap exactly once", () => {
  const nodes: Node[] = [
    {
      id: "outer",
      type: "shape",
      position: { x: 80, y: 40 },
      measured: { width: 180, height: 64 },
      data: { layoutMode: "vertical", childOrder: ["matrix", "other"] },
    },
    {
      id: "matrix",
      type: "shape",
      position: { x: 100, y: 180 },
      measured: { width: 360, height: 120 },
      data: { parentId: "outer", childOrder: ["matrix-child"], layoutMode: "matrix" },
    },
    {
      id: "matrix-child",
      type: "shape",
      position: { x: 300, y: 300 },
      measured: { width: 160, height: 80 },
      data: { parentId: "matrix", childOrder: [] },
    },
    {
      id: "other",
      type: "shape",
      position: { x: 1200, y: 180 },
      measured: { width: 180, height: 72 },
      data: { parentId: "outer", childOrder: ["other-child"] },
    },
    {
      id: "other-child",
      type: "shape",
      position: { x: 1230, y: 310 },
      measured: { width: 160, height: 64 },
      data: { parentId: "other", childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    { id: "outer-matrix", source: "outer", target: "matrix" },
    { id: "matrix-child", source: "matrix", target: "matrix-child" },
    { id: "outer-other", source: "outer", target: "other" },
    { id: "other-child", source: "other", target: "other-child" },
  ];
  const hierarchy = buildHierarchy(nodes, edges);
  const originalOther = nodes.find((node) => node.id === "other")!;
  const originalOtherChild = nodes.find((node) => node.id === "other-child")!;
  const packed = packSiblingsAfterNestedMatrix(nodes, hierarchy, "matrix");
  const matrixRight = Math.max(
    getNodeRect(packed.find((node) => node.id === "matrix")!).right,
    getNodeRect(packed.find((node) => node.id === "matrix-child")!).right
  );
  const packedOther = packed.find((node) => node.id === "other")!;
  const packedOtherChild = packed.find((node) => node.id === "other-child")!;

  assert.equal(getNodeRect(packedOther).left, matrixRight + 42);
  assert.equal(
    packedOtherChild.position.x - originalOtherChild.position.x,
    packedOther.position.x - originalOther.position.x
  );
  assert.strictEqual(packSiblingsAfterNestedMatrix(packed, hierarchy, "matrix"), packed);
});
