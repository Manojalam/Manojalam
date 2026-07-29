import assert from "node:assert/strict";
import test from "node:test";
import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy } from "./hierarchy";
import { getNodeRect } from "./geometry";
import { LIST_DENSITIES } from "./list-layout";
import { routeOrthogonalEdge } from "./edge-routing";
import { patchUsesOrientedMatrixComposition } from "../canvas/layout-reflow";
import {
  NESTED_MATRIX_PARENT_GAP,
  packSiblingsAfterNestedMatrix,
} from "./nested-matrix-spacing";
import {
  MATRIX_GRID_RADIUS,
  MATRIX_GRID_STROKE_WIDTH,
  matrixCellDivisionPadding,
  matrixCellBorderRadius,
} from "./matrix-presentation";
import { buildMatrixFrameNodes } from "./matrix-frames";
import {
  MATRIX_DENSITY_SETTINGS,
  MATRIX_HEADER_MIN_WIDTH,
  MATRIX_MAX_COLUMN_WIDTH,
  buildMatrixLeafRows,
  computeMatrixLayout,
  resolveMatrixCellResize,
  getMatrixBaseSize,
  isMatrixHierarchyEdge,
  matrixAncestorSpanOverrideResets,
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
  incompleteRowMode?: "stretch" | "empty";
  siblingGap?: number;
  matrixWidth?: number;
  matrixHeight?: number;
  matrixTableWidth?: number;
  matrixTableHeight?: number;
  compositionMode?: "oriented";
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
      ...(spec.incompleteRowMode ? { matrixIncompleteRowMode: spec.incompleteRowMode } : {}),
      ...(spec.siblingGap !== undefined ? { matrixSiblingGap: spec.siblingGap } : {}),
      ...(spec.matrixWidth ? { matrixWidthOverride: spec.matrixWidth } : {}),
      ...(spec.matrixHeight ? { matrixHeightOverride: spec.matrixHeight } : {}),
      ...(spec.matrixTableWidth ? { matrixTableWidthOverride: spec.matrixTableWidth } : {}),
      ...(spec.matrixTableHeight ? { matrixTableHeightOverride: spec.matrixTableHeight } : {}),
      ...(spec.compositionMode ? { matrixCompositionMode: spec.compositionMode } : {}),
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

test("an exact terminal grandchild spans columns reserved for great-grandchildren", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    { id: "shallow-category", parentId: "root" },
    { id: "shallow-child", parentId: "shallow-category" },
    { id: "terminal-grandchild", parentId: "shallow-child", matrixWidth: 180 },
    { id: "deep-category", parentId: "root" },
    { id: "deep-child", parentId: "deep-category" },
    { id: "deep-grandchild", parentId: "deep-child" },
    { id: "great-grandchild", parentId: "deep-grandchild" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const terminal = result.cells.find((cell) => cell.nodeId === "terminal-grandchild")!;
  const renderedNodes = [result.header, ...result.cells].map<Node>((cell) => ({
    id: cell.nodeId,
    type: "shape",
    position: { x: cell.x, y: cell.y },
    style: { width: cell.width, height: cell.height },
    data: {
      matrixCell: true,
      ...(cell.nodeId === "root" ? {} : { parentId: hierarchy.get(cell.nodeId)?.parentId }),
    },
  }));
  const frame = buildMatrixFrameNodes(renderedNodes, "root")[0];
  const frameData = frame.data as Record<string, unknown>;
  const gridLines = frameData.matrixGridLines as Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  const frameLeft = frame.position.x;
  const frameTop = frame.position.y;
  const terminalCenterY = terminal.y + terminal.height / 2 - frameTop;
  const divisionsThroughTerminal = gridLines.filter((line) => (
    Math.abs(line.x1 - line.x2) < 0.5
    && line.x1 > terminal.x - frameLeft + 0.5
    && line.x1 < terminal.x + terminal.width - frameLeft - 0.5
    && line.y1 <= terminalCenterY
    && line.y2 >= terminalCenterY
  ));

  assert.equal(terminal.x + terminal.width, result.bounds.right);
  assert.deepEqual(divisionsThroughTerminal, []);
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

test("incomplete compact rows can preserve a generated empty trailing cell", () => {
  const specs: TreeNode[] = [
    {
      id: "root",
      parentId: null,
      text: "व्यञ्जनानि",
      packCompactGroups: true,
      incompleteRowMode: "empty",
    },
    { id: "groups", parentId: "root", text: "वर्गाः" },
    { id: "five", parentId: "groups", text: "पञ्च" },
    ...["क", "ख", "ग", "घ", "ङ"].map((text, index) => ({
      id: `five-${index}`,
      parentId: "five",
      text,
    })),
    { id: "four", parentId: "groups", text: "चत्वारः" },
    ...["य", "व", "र", "ल"].map((text, index) => ({
      id: `four-${index}`,
      parentId: "four",
      text,
    })),
  ];
  const { nodes, edges } = buildTree(specs);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(result.emptyCells.length, 1);
  const empty = result.emptyCells[0];
  assert.ok(Math.abs(empty.x - cells.get("five-4")!.x) < 0.5);
  assert.ok(Math.abs(empty.y - cells.get("four-3")!.y) < 0.5);
  assert.ok(Math.abs(empty.width - cells.get("five-4")!.width) < 0.5);
  assert.ok(cells.get("four-3")!.x + cells.get("four-3")!.width < empty.x);
  assertClean(result);
});

test("incomplete folded child rows preserve an empty trailing grid slot", () => {
  const fixture = buildTree([
    {
      id: "root",
      parentId: null,
      packCompactGroups: true,
      incompleteRowMode: "empty",
    },
    { id: "group", parentId: "root" },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `child-${index}`,
      parentId: "group",
      text: "क",
    })),
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "group"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const childCells = Array.from(
    { length: 5 },
    (_, index) => result.cells.find((cell) => cell.nodeId === `child-${index}`)!
  );
  const groupedRows = new Map<number, typeof childCells>();
  for (const cell of childCells) {
    const rowY = Math.round(cell.y * 2) / 2;
    groupedRows.set(rowY, [...(groupedRows.get(rowY) ?? []), cell]);
  }
  const rows = [...groupedRows.values()]
    .sort((first, second) => second.length - first.length);

  assert.deepEqual(rows.map((row) => row.length), [3, 2]);
  assert.equal(result.emptyCells.length, 1);
  const longerRow = [...rows[0]].sort((first, second) => first.x - second.x);
  const shorterRow = [...rows[1]].sort((first, second) => first.x - second.x);
  const empty = result.emptyCells[0];
  assert.ok(Math.abs(empty.y - shorterRow[0].y) < 0.5);
  assert.ok(Math.abs(empty.x - longerRow[2].x) < 0.5);
  assert.ok(Math.abs(empty.width - longerRow[2].width) < 0.5);
  assertClean(result);
});

test("folded sibling groups share the Matrix-wide five-column template", () => {
  const fixture = buildTree([
    {
      id: "root",
      parentId: null,
      packCompactGroups: true,
      incompleteRowMode: "empty",
    },
    { id: "groups", parentId: "root" },
    { id: "short", parentId: "groups", childFlow: "row" },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `short-${index}`,
      parentId: "short",
      text: "अ",
    })),
    { id: "long", parentId: "groups", childFlow: "row" },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `long-${index}`,
      parentId: "long",
      text: "आ",
    })),
    { id: "pluta", parentId: "groups", childFlow: "row" },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `pluta-${index}`,
      parentId: "pluta",
      text: "अ३",
    })),
  ]);
  const nodes = fixture.nodes.map((node) =>
    node.id === "long" || node.id === "pluta"
      ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
      : node
  );
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const leafCells = result.cells.filter((cell) =>
    /^(short|long|pluta)-\d+$/.test(cell.nodeId)
  );
  const rows = new Map<number, Array<{ x: number; placeholder: boolean }>>();
  for (const cell of leafCells) {
    const rowY = Math.round(cell.y * 2) / 2;
    rows.set(rowY, [
      ...(rows.get(rowY) ?? []),
      { x: cell.x, placeholder: false },
    ]);
  }
  for (const cell of result.emptyCells) {
    const rowY = Math.round(cell.y * 2) / 2;
    rows.set(rowY, [
      ...(rows.get(rowY) ?? []),
      { x: cell.x, placeholder: true },
    ]);
  }

  assert.equal(rows.size, 5);
  assert.deepEqual(
    [...rows.values()].map((row) => row.length),
    [5, 5, 5, 5, 5]
  );
  assert.equal(result.emptyCells.length, 3);
  const fifthColumnX = Math.max(
    ...leafCells
      .filter((cell) => cell.nodeId.startsWith("short-"))
      .map((cell) => cell.x)
  );
  assert.ok(result.emptyCells.every((cell) => Math.abs(cell.x - fifthColumnX) < 0.5));
  assertClean(result);
});

test("mixed-width folded groups do not combine unrelated column maxima", () => {
  const fixture = buildTree([
    {
      id: "root",
      parentId: null,
      incompleteRowMode: "empty",
    },
    { id: "group-a", parentId: "root", childFlow: "row" },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `a-${index}`,
      parentId: "group-a",
      text: "लघु",
    })),
    { id: "group-b", parentId: "root", childFlow: "row" },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `b-${index}`,
      parentId: "group-b",
      text: "लघु",
    })),
  ]);
  const nodes = fixture.nodes.map((node) => {
    if (node.id === "group-a") {
      return {
        ...node,
        data: {
          ...node.data,
          layoutFoldCount: 2,
          layoutFoldBreakAfter: ["a-1"],
        },
      };
    }
    if (node.id === "group-b") {
      return {
        ...node,
        data: {
          ...node.data,
          layoutFoldCount: 2,
          layoutFoldBreakAfter: ["b-1"],
        },
      };
    }
    if (node.id === "a-0" || node.id === "b-1") {
      return {
        ...node,
        data: {
          ...node.data,
          matrixWidthOverride: 520,
        },
      };
    }
    return node;
  });
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(cells.get("a-0")?.width, 520);
  assert.equal(cells.get("b-1")?.width, 520);
  assert.ok(
    result.bounds.width < 900,
    `mixed Fold tracks inflated the Matrix to ${result.bounds.width}px`
  );
  assertClean(result);
});

test("empty-slot mode derives tracks from the longest logical sibling row", () => {
  const { nodes, edges } = buildTree([
    {
      id: "root",
      parentId: null,
      incompleteRowMode: "empty",
    },
    { id: "group", parentId: "root", childFlow: "column" },
    { id: "heading", parentId: "group", text: "Merged heading" },
    { id: "row-three", parentId: "group", childFlow: "row" },
    { id: "three-0", parentId: "row-three" },
    { id: "three-1", parentId: "row-three" },
    { id: "three-2", parentId: "row-three" },
    { id: "row-two", parentId: "group", childFlow: "row" },
    { id: "two-0", parentId: "row-two", matrixWidth: 280 },
    { id: "two-1", parentId: "row-two", matrixWidth: 280 },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const empty = result.emptyCells[0];

  assert.equal(result.emptyCells.length, 1);
  assert.ok(empty);
  assert.ok(Math.abs(cells.get("two-0")!.width - cells.get("three-0")!.width) < 0.5);
  assert.ok(Math.abs(cells.get("two-1")!.width - cells.get("three-1")!.width) < 0.5);
  assert.ok(Math.abs(empty.x - cells.get("three-2")!.x) < 0.5);
  assert.ok(Math.abs(empty.y - cells.get("two-0")!.y) < 0.5);
  assert.ok(Math.abs(empty.width - cells.get("three-2")!.width) < 0.5);
  assert.ok(
    Math.abs(
      cells.get("heading")!.x + cells.get("heading")!.width
      - (cells.get("three-2")!.x + cells.get("three-2")!.width)
    ) < 0.5
  );
  assertClean(result);
});

test("a terminal grandchild merges across deeper sibling tracks in empty-slot mode", () => {
  const { nodes, edges } = buildTree([
    {
      id: "root",
      parentId: null,
      incompleteRowMode: "empty",
    },
    { id: "shallow-category", parentId: "root" },
    { id: "terminal-grandchild", parentId: "shallow-category" },
    { id: "single-parent", parentId: "shallow-category" },
    { id: "single-great-grandchild", parentId: "single-parent" },
    { id: "deep-category", parentId: "root" },
    { id: "three-parent", parentId: "deep-category", childFlow: "row" },
    { id: "great-grandchild-0", parentId: "three-parent" },
    { id: "great-grandchild-1", parentId: "three-parent" },
    { id: "great-grandchild-2", parentId: "three-parent" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const terminal = cells.get("terminal-grandchild")!;
  const lastGreatGrandchild = cells.get("great-grandchild-2")!;
  const singleGreatGrandchild = cells.get("single-great-grandchild")!;
  const singleRowEmptyCells = result.emptyCells
    .filter((cell) => Math.abs(cell.y - singleGreatGrandchild.y) < 0.5)
    .sort((first, second) => first.x - second.x);
  const renderedNodes = [result.header, ...result.cells].map<Node>((cell) => ({
    id: cell.nodeId,
    type: "shape",
    position: { x: cell.x, y: cell.y },
    style: { width: cell.width, height: cell.height },
    data: {
      matrixCell: true,
      ...(cell.nodeId === "root"
        ? {
          matrixEmptySlots: result.emptyCells.map((empty) => ({
            x: empty.x - result.bounds.left,
            y: empty.y - result.bounds.top,
            width: empty.width,
            height: empty.height,
          })),
        }
        : { parentId: hierarchy.get(cell.nodeId)?.parentId }),
    },
  }));
  const frame = buildMatrixFrameNodes(renderedNodes, "root")[0];
  const gridLines = (frame.data as Record<string, unknown>).matrixGridLines as Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  const terminalCenterY = terminal.y + terminal.height / 2 - frame.position.y;
  const divisionsThroughTerminal = gridLines.filter((line) => (
    Math.abs(line.x1 - line.x2) < 0.5
    && line.x1 > terminal.x - frame.position.x + 0.5
    && line.x1 < terminal.x + terminal.width - frame.position.x - 0.5
    && line.y1 <= terminalCenterY
    && line.y2 >= terminalCenterY
  ));

  assert.ok(Math.abs(
    terminal.x + terminal.width
    - (lastGreatGrandchild.x + lastGreatGrandchild.width)
  ) < 0.5);
  assert.equal(
    result.emptyCells.filter((cell) => Math.abs(cell.y - terminal.y) < 0.5).length,
    0
  );
  assert.equal(singleRowEmptyCells.length, 2);
  assert.ok(Math.abs(singleRowEmptyCells[0].x - cells.get("great-grandchild-1")!.x) < 0.5);
  assert.ok(Math.abs(singleRowEmptyCells[1].x - lastGreatGrandchild.x) < 0.5);
  assert.deepEqual(divisionsThroughTerminal, []);
  assertClean(result);
});

test("terminal cells fill every unused deeper level in a four-level Matrix", () => {
  const sharedWidth = 194;
  const { nodes, edges } = buildTree([
    {
      id: "root",
      parentId: null,
      text: "स्वरसन्धयः",
      incompleteRowMode: "empty",
      childFlow: "column",
      matrixWidth: 782,
    },
    { id: "shallow-category", parentId: "root", text: "यण्", matrixWidth: sharedWidth },
    { id: "shallow-terminal", parentId: "shallow-category", text: "इको यणचि", matrixWidth: sharedWidth },
    { id: "mid-parent", parentId: "shallow-category", text: "सुधी + उपास्यः", matrixWidth: 218 },
    { id: "mid-terminal", parentId: "mid-parent", text: "मधु + अरिः", matrixWidth: sharedWidth },
    { id: "deep-category", parentId: "root", text: "दीर्घः", matrixWidth: sharedWidth },
    { id: "deep-parent", parentId: "deep-category", text: "प्रथम स्तरः", matrixWidth: sharedWidth },
    { id: "deeper-parent", parentId: "deep-parent", text: "द्वितीय स्तरः", matrixWidth: 228 },
    { id: "deepest-terminal", parentId: "deeper-parent", text: "तृतीय स्तरः", matrixWidth: sharedWidth },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const bodyRight = result.bounds.right;

  assert.ok(Math.abs(cells.get("shallow-terminal")!.x + cells.get("shallow-terminal")!.width - bodyRight) < 0.5);
  assert.ok(Math.abs(cells.get("mid-terminal")!.x + cells.get("mid-terminal")!.width - bodyRight) < 0.5);
  assert.equal(
    result.emptyCells.filter((cell) => Math.abs(cell.y - cells.get("shallow-terminal")!.y) < 0.5).length,
    0
  );
  assert.equal(
    result.emptyCells.filter((cell) => Math.abs(cell.y - cells.get("mid-terminal")!.y) < 0.5).length,
    0
  );
  assertMatrixBodyTiled(result);
  assertClean(result);
});

test("a terminal in a peer branch absorbs Fold-only trailing allocation", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, incompleteRowMode: "empty", childFlow: "column" },
    { id: "shallow-category", parentId: "root", childFlow: "column" },
    { id: "single-row-parent", parentId: "shallow-category", childFlow: "row", matrixWidth: 220, siblingGap: 3 },
    { id: "single-row-child", parentId: "single-row-parent", childFlow: "column", siblingGap: 15 },
    { id: "single-row-deeper", parentId: "single-row-child", childFlow: "column", matrixWidth: 250 },
    { id: "terminal", parentId: "single-row-deeper", childFlow: "column", matrixWidth: 277 },
    { id: "folded-category", parentId: "root", childFlow: "column", matrixWidth: 185 },
    { id: "deep-1", parentId: "folded-category", childFlow: "column", matrixWidth: 314 },
    { id: "deep-2", parentId: "deep-1", childFlow: "row" },
    { id: "deep-3", parentId: "deep-2", childFlow: "column", matrixWidth: 202 },
    { id: "deep-terminal", parentId: "deep-3", childFlow: "row", matrixWidth: 288 },
    { id: "medium-1", parentId: "folded-category", childFlow: "column", matrixWidth: 242 },
    { id: "medium-terminal", parentId: "medium-1", childFlow: "column", matrixWidth: 133 },
    { id: "short-terminal", parentId: "folded-category", childFlow: "column", matrixWidth: 284 },
    { id: "last-terminal", parentId: "folded-category", childFlow: "column" },
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "folded-category"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const edges = fixture.edges;
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const terminal = result.cells.find((cell) => cell.nodeId === "terminal")!;

  assert.ok(Math.abs(terminal.x + terminal.width - result.bounds.right) < 0.5);
  assert.equal(
    result.emptyCells.filter((cell) => Math.abs(cell.y - terminal.y) < 0.5).length,
    0
  );
  assertClean(result);
});

test("incomplete compact rows stretch existing children by default", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, packCompactGroups: true },
    { id: "groups", parentId: "root" },
    { id: "five", parentId: "groups" },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `five-${index}`,
      parentId: "five",
      text: "क",
    })),
    { id: "four", parentId: "groups" },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `four-${index}`,
      parentId: "four",
      text: "य",
    })),
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(result.emptyCells.length, 0);
  assert.ok(cells.get("four-0")!.width > cells.get("five-0")!.width);
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

test("Matrix presentation keeps rounded shapes inside a flat table grid", () => {
  assert.equal(matrixCellBorderRadius("header"), 24);
  assert.equal(matrixCellBorderRadius("category"), 20);
  assert.equal(matrixCellBorderRadius("cell"), 18);
  assert.equal(MATRIX_GRID_STROKE_WIDTH, 1);
  assert.equal(MATRIX_GRID_RADIUS, 4);
  assert.equal(matrixCellDivisionPadding("compact"), 3);
  assert.equal(matrixCellDivisionPadding("comfortable"), 4);
  assert.equal(matrixCellDivisionPadding("presentation"), 6);
});

test("Matrix creates one continuous grid with every merged-cell division", () => {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 20, y: 10 },
      style: { width: 336, height: 60 },
      data: {
        parentId: null,
        matrixCell: true,
        matrixDensity: "comfortable",
        layoutVisualStyle: { fillColor: "#047857", borderColor: "#064e3b" },
      },
    },
    {
      id: "short",
      type: "shape",
      position: { x: 20, y: 86 },
      style: { width: 120, height: 50 },
      data: {
        parentId: "root",
        matrixCell: true,
        layoutVisualStyle: { borderColor: "#065f46" },
      },
    },
    {
      id: "a",
      type: "shape",
      position: { x: 148, y: 86 },
      style: { width: 100, height: 50 },
      data: { parentId: "short", matrixCell: true },
    },
    {
      id: "long",
      type: "shape",
      position: { x: 20, y: 144 },
      style: { width: 120, height: 108 },
      data: {
        parentId: "root",
        matrixCell: true,
        layoutVisualStyle: { borderColor: "#047857" },
      },
    },
    {
      id: "aa",
      type: "shape",
      position: { x: 148, y: 144 },
      style: { width: 100, height: 50 },
      data: { parentId: "long", matrixCell: true },
    },
    {
      id: "ii",
      type: "shape",
      position: { x: 148, y: 202 },
      style: { width: 100, height: 50 },
      data: { parentId: "long", matrixCell: true },
    },
    {
      id: "standalone",
      type: "shape",
      position: { x: 256, y: 86 },
      style: { width: 100, height: 50 },
      data: { parentId: "root", matrixCell: true },
    },
  ];

  const frames = buildMatrixFrameNodes(nodes, "root");
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].position, { x: 16, y: 6 });
  assert.equal(frames[0].style?.width, 344);
  assert.equal(frames[0].style?.height, 250);
  const frameData = frames[0].data as Record<string, unknown>;
  assert.equal(frameData.borderWidth, 1);
  assert.equal(frameData.matrixOuterBorderVisible, true);
  assert.equal(frameData.matrixGridVisible, true);
  assert.deepEqual(frameData.matrixGridLines, [
    { x1: 0, y1: 72, x2: 344, y2: 72 },
    { x1: 0, y1: 134, x2: 344, y2: 134 },
    { x1: 128, y1: 192, x2: 236, y2: 192 },
    { x1: 128, y1: 72, x2: 128, y2: 250 },
    { x1: 236, y1: 72, x2: 236, y2: 250 },
  ]);
});

test("hiding Matrix divisions keeps the single outer grid rectangle", () => {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 20, y: 10 },
      style: { width: 300, height: 60 },
      data: {
        matrixCell: true,
        matrixGridVisible: false,
        layoutVisualStyle: { fillColor: "#047857", borderColor: "#064e3b" },
      },
    },
    {
      id: "leaf",
      type: "shape",
      position: { x: 20, y: 80 },
      style: { width: 100, height: 50 },
      data: { parentId: "root", matrixCell: true },
    },
  ];

  const frames = buildMatrixFrameNodes(nodes, "root");
  assert.equal(frames.length, 1);
  const frameData = frames[0].data as Record<string, unknown>;
  assert.equal(frameData.matrixOuterBorderVisible, true);
  assert.equal(frameData.matrixGridVisible, false);
  assert.deepEqual(frameData.matrixGridLines, []);
});

test("hiding the overall Matrix border keeps internal cell divisions", () => {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 20, y: 10 },
      style: { width: 300, height: 60 },
      data: {
        matrixCell: true,
        matrixOuterBorderVisible: false,
        layoutVisualStyle: { fillColor: "#047857", borderColor: "#064e3b" },
      },
    },
    {
      id: "leaf",
      type: "shape",
      position: { x: 20, y: 80 },
      style: { width: 100, height: 50 },
      data: { parentId: "root", matrixCell: true },
    },
  ];

  const frames = buildMatrixFrameNodes(nodes, "root");
  assert.equal(frames.length, 1);
  const frameData = frames[0].data as Record<string, unknown>;
  assert.equal(frameData.matrixOuterBorderVisible, false);
  assert.equal(frameData.matrixGridVisible, true);
  assert.notDeepEqual(frameData.matrixGridLines, []);
});

test("generated Matrix empty slots extend the flat grid without a filled placeholder shape", () => {
  const nodes: Node[] = [
    {
      id: "root",
      type: "shape",
      position: { x: 20, y: 10 },
      style: { width: 300, height: 60 },
      data: {
        matrixCell: true,
        matrixDensity: "comfortable",
        matrixEmptySlots: [{
          x: 100,
          y: 70,
          width: 100,
          height: 50,
        }],
        layoutVisualStyle: { fillColor: "#2563eb", borderColor: "#1e40af" },
      },
    },
    {
      id: "leaf",
      type: "shape",
      position: { x: 20, y: 80 },
      style: { width: 100, height: 50 },
      data: {
        parentId: "root",
        matrixCell: true,
        layoutVisualStyle: { fillColor: "#bfdbfe", borderColor: "#3b82f6" },
      },
    },
  ];

  const frames = buildMatrixFrameNodes(nodes, "root");
  const frameData = frames[0].data as Record<string, unknown>;
  const lines = frameData.matrixGridLines as Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;

  assert.equal(frameData.matrixEmptyCells, undefined);
  assert.deepEqual(lines, [
    { x1: 0, y1: 69, x2: 308, y2: 69 },
    { x1: 104, y1: 69, x2: 104, y2: 128 },
    { x1: 208, y1: 69, x2: 208, y2: 128 },
  ]);
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

test("standard Matrix leaf siblings share one content-safe height within their parent", () => {
  const paragraph = "अथातो धर्मजिज्ञासा संस्कृतव्याकरणस्य विस्तीर्णविवरणम् ".repeat(12).trim();
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, text: "व्याकरणम्" },
    { id: "category", parentId: "root", text: "सन्धिः" },
    { id: "short-a", parentId: "category", text: "हरे + ए = हरये।" },
    { id: "short-b", parentId: "category", text: "नै + अकः = नायकः।" },
    { id: "long", parentId: "category", text: paragraph },
    { id: "short-c", parentId: "category", text: "गो + अकः = गावकः।" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const siblings = ["short-a", "short-b", "long", "short-c"].map((id) => cells.get(id)!);
  const siblingHeight = siblings[0].height;
  const category = cells.get("category")!;
  const gap = MATRIX_DENSITY_SETTINGS[result.density].cellGap;

  assert.ok(siblingHeight > MATRIX_DENSITY_SETTINGS.comfortable.minRowHeight * 2);
  siblings.forEach((cell) => assert.equal(cell.height, siblingHeight));
  assert.equal(category.height, siblingHeight * siblings.length + gap * (siblings.length - 1));
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

test("top-level Fold gives every section the complete current Matrix width", () => {
  const fixture = buildTree([
    {
      id: "root",
      parentId: null,
      matrixTableWidth: 840,
      matrixTableHeight: 900,
      siblingGap: 22,
    },
    ...Array.from({ length: 6 }, (_, groupIndex) => [
      { id: `group-${groupIndex}`, parentId: "root" },
      { id: `rule-${groupIndex}`, parentId: `group-${groupIndex}` },
      ...Array.from({ length: groupIndex % 3 + 1 }, (_, exampleIndex) => ({
        id: `example-${groupIndex}-${exampleIndex}`,
        parentId: `rule-${groupIndex}`,
      })),
    ]).flat(),
  ]);
  const unfoldedNodes = fixture.nodes.map((node) => node.id === "rule-0"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const foldedNodes = unfoldedNodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutFoldCount: 3 } }
    : node);
  const unfoldedHierarchy = buildHierarchy(unfoldedNodes, fixture.edges);
  const foldedHierarchy = buildHierarchy(foldedNodes, fixture.edges);
  const unfolded = computeMatrixLayout(
    "root",
    unfoldedHierarchy,
    new Map(unfoldedNodes.map((node) => [node.id, node]))
  );
  const folded = computeMatrixLayout(
    "root",
    foldedHierarchy,
    new Map(foldedNodes.map((node) => [node.id, node]))
  );
  const unfoldedCells = new Map(unfolded.cells.map((cell) => [cell.nodeId, cell]));
  const foldedCells = new Map(folded.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(unfolded.header.width, 840);
  assert.equal(folded.header.width, unfolded.header.width * 3 + 22 * 2);
  assert.equal(folded.header.height, unfolded.header.height);
  assert.equal(folded.header.x, unfolded.header.x);
  assert.equal(folded.header.y, unfolded.header.y);
  for (const [nodeId, before] of unfoldedCells) {
    const after = foldedCells.get(nodeId)!;
    assert.equal(after.width, before.width, `${nodeId} width changed during top-level Fold`);
    assert.equal(after.height, before.height, `${nodeId} height changed during top-level Fold`);
    assert.equal(
      after.requiredHeight,
      before.requiredHeight,
      `${nodeId} required height changed during top-level Fold`
    );
  }

  const sectionStride = unfolded.header.width + 22;
  const sectionStarts = ["group-0", "group-2", "group-4"].map((nodeId) => foldedCells.get(nodeId)!);
  assert.equal(sectionStarts[0].y, sectionStarts[1].y);
  assert.equal(sectionStarts[1].y, sectionStarts[2].y);
  assert.equal(sectionStarts[1].x - sectionStarts[0].x, sectionStride);
  assert.equal(sectionStarts[2].x - sectionStarts[1].x, sectionStride);
  for (const groupIndexes of [[0, 1], [2, 3], [4, 5]]) {
    const anchorId = `group-${groupIndexes[0]}`;
    const anchorBefore = unfoldedCells.get(anchorId)!;
    const anchorAfter = foldedCells.get(anchorId)!;
    const sectionDelta = {
      x: anchorAfter.x - anchorBefore.x,
      y: anchorAfter.y - anchorBefore.y,
    };
    const sectionNodeIds = groupIndexes.flatMap((groupIndex) => [
      `group-${groupIndex}`,
      `rule-${groupIndex}`,
      ...Array.from(
        { length: groupIndex % 3 + 1 },
        (_, exampleIndex) => `example-${groupIndex}-${exampleIndex}`
      ),
    ]);
    for (const nodeId of sectionNodeIds) {
      const before = unfoldedCells.get(nodeId)!;
      const after = foldedCells.get(nodeId)!;
      assert.ok(
        Math.abs(after.x - before.x - sectionDelta.x) < 0.001,
        `${nodeId} moved horizontally within its section`
      );
      assert.ok(
        Math.abs(after.y - before.y - sectionDelta.y) < 0.001,
        `${nodeId} moved vertically within its section`
      );
    }
  }
  assertClean(folded);
});

test("manual top-level Fold breaks never shrink later sections", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, matrixTableWidth: 640 },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `child-${index}`,
      parentId: "root",
    })),
  ]);
  const foldedNodes = fixture.nodes.map((node) => node.id === "root"
    ? {
        ...node,
        data: {
          ...node.data,
          layoutFoldCount: 3,
          layoutFoldBreakAfter: ["child-0", "child-4"],
        },
      }
    : node);
  const unfoldedHierarchy = buildHierarchy(fixture.nodes, fixture.edges);
  const foldedHierarchy = buildHierarchy(foldedNodes, fixture.edges);
  const unfolded = computeMatrixLayout(
    "root",
    unfoldedHierarchy,
    new Map(fixture.nodes.map((node) => [node.id, node]))
  );
  const folded = computeMatrixLayout(
    "root",
    foldedHierarchy,
    new Map(foldedNodes.map((node) => [node.id, node]))
  );
  const unfoldedCells = new Map(unfolded.cells.map((cell) => [cell.nodeId, cell]));
  const foldedCells = new Map(folded.cells.map((cell) => [cell.nodeId, cell]));
  const gap = MATRIX_DENSITY_SETTINGS[folded.density].cellGap;
  const stride = unfolded.header.width + gap;

  assert.equal(folded.header.width, unfolded.header.width * 3 + gap * 2);
  assert.equal(foldedCells.get("child-1")!.x - foldedCells.get("child-0")!.x, stride);
  assert.equal(foldedCells.get("child-5")!.x - foldedCells.get("child-1")!.x, stride);
  assert.equal(foldedCells.get("child-0")!.y, foldedCells.get("child-1")!.y);
  assert.equal(foldedCells.get("child-1")!.y, foldedCells.get("child-5")!.y);
  for (const [nodeId, before] of unfoldedCells) {
    const after = foldedCells.get(nodeId)!;
    assert.equal(after.width, before.width, `${nodeId} width changed`);
    assert.equal(after.height, before.height, `${nodeId} height changed`);
  }
  const renderedNodes = [folded.header, ...folded.cells].map<Node>((cell) => ({
    id: cell.nodeId,
    type: "shape",
    position: { x: cell.x, y: cell.y },
    style: { width: cell.width, height: cell.height },
    data: {
      matrixCell: true,
      matrixDensity: folded.density,
      parentId: foldedHierarchy.get(cell.nodeId)?.parentId,
    },
  }));
  const frame = buildMatrixFrameNodes(renderedNodes, "root")[0];
  const gridLines = (frame.data as Record<string, unknown>).matrixGridLines as Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  const expectedSectionDivisions = ["child-0", "child-1"].map((nodeId) => {
    const cell = foldedCells.get(nodeId)!;
    return cell.x + cell.width + gap / 2;
  });
  const verticalDivisionX = gridLines
    .filter((line) => Math.abs(line.x1 - line.x2) < 0.5)
    .map((line) => line.x1 + frame.position.x);
  for (const expectedX of expectedSectionDivisions) {
    assert.ok(
      verticalDivisionX.some((actualX) => Math.abs(actualX - expectedX) < 0.5),
      `missing Matrix section division at ${expectedX}`
    );
  }
  assertClean(folded);
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

test("a top-level branch Fold preserves the shorter section's natural height", () => {
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
  assert.ok(short.height < tall.height);
  assert.equal(result.header.x, unfolded.header.x);
  assert.equal(result.header.y, unfolded.header.y);
  assertClean(result);
});

test("a top-level vertical Matrix Fold uses full-width sections without resizing children", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, orientation: "vertical" },
    { id: "wide", parentId: "root" },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `wide-${index}`, parentId: "wide" })),
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
  const unfoldedCells = new Map(unfolded.cells.map((cell) => [cell.nodeId, cell]));
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const wide = cells.get("wide")!;
  const short = cells.get("short")!;
  const gap = MATRIX_DENSITY_SETTINGS[result.density].cellGap;

  assert.equal(short.x - wide.x, unfolded.header.width + gap);
  assert.equal(wide.y, short.y);
  assert.equal(wide.width, unfoldedCells.get("wide")!.width);
  assert.equal(short.width, unfoldedCells.get("short")!.width);
  assert.ok(short.width < wide.width);
  assert.equal(result.header.width, unfolded.header.width * 2 + gap);
  assertClean(result);
});

test("a complex branch Fold preserves descendant row alignment without overlaps", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "deep", parentId: "root" },
    { id: "deep-rule-1", parentId: "deep", childFlow: "row" },
    { id: "deep-1-a", parentId: "deep-rule-1", matrixHeight: 112 },
    { id: "deep-1-b", parentId: "deep-rule-1" },
    { id: "deep-1-c", parentId: "deep-rule-1" },
    { id: "deep-rule-2", parentId: "deep", childFlow: "row" },
    { id: "deep-2-a", parentId: "deep-rule-2" },
    { id: "deep-2-b", parentId: "deep-rule-2" },
    { id: "short", parentId: "root" },
    { id: "short-rule", parentId: "short", childFlow: "row" },
    { id: "short-a", parentId: "short-rule" },
    { id: "short-b", parentId: "short-rule" },
    { id: "short-c", parentId: "short-rule" },
  ]);
  const nodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const hierarchy = buildHierarchy(nodes, fixture.edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
  const shortRow = ["short-a", "short-b", "short-c"].map((nodeId) => cells.get(nodeId)!);

  assert.equal(new Set(shortRow.map((cell) => cell.y)).size, 1);
  assert.equal(new Set(shortRow.map((cell) => cell.height)).size, 1);
  assert.equal(cells.get("short")!.height, cells.get("short-rule")!.height);
  assert.ok(cells.get("short")!.height < cells.get("deep")!.height);
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

test("a compact nested Fold divides outer branches evenly by count", () => {
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

  assert.equal(cells.get("varna")!.x, cells.get("guna")!.x);
  assert.ok(cells.get("vrddhi")!.x > cells.get("guna")!.x);
  assert.equal(cells.get("vrddhi")!.x, cells.get("para")!.x);
  assert.equal(cells.get("varna")!.y, cells.get("vrddhi")!.y);
  assertClean(result);
});

test("count-balanced top-level Fold sections preserve natural nested branch geometry", () => {
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
  const vrddhi = cells.get("vrddhi")!;
  const savarnaExample = cells.get("savarna-example-0")!;

  assert.equal(savarna.height, guna.height);
  assert.equal(savarnaExample.height, savarnaExample.requiredHeight);
  assert.equal(guna.x, savarna.x);
  assert.ok(vrddhi.x > guna.x);
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
    { id: "short", parentId: "root", matrixHeight: 80 },
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

test("automatic root flow preserves the same composition as explicit Column", () => {
  const fixture = buildTree([
    { id: "root", parentId: null },
    { id: "first", parentId: "root" },
    { id: "first-a", parentId: "first" },
    { id: "first-a-1", parentId: "first-a" },
    { id: "first-a-2", parentId: "first-a" },
    { id: "first-b", parentId: "first" },
    { id: "second", parentId: "root" },
    { id: "second-a", parentId: "second" },
    { id: "second-b", parentId: "second" },
    { id: "second-c", parentId: "second" },
  ]);
  const automaticNodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, matrixCompositionMode: "oriented" } }
    : node);
  const explicitNodes = fixture.nodes.map((node) => node.id === "root"
    ? { ...node, data: { ...node.data, matrixChildFlow: "column" } }
    : node);
  const automatic = computeMatrixLayout(
    "root",
    buildHierarchy(automaticNodes, fixture.edges),
    new Map(automaticNodes.map((node) => [node.id, node]))
  );
  const explicit = computeMatrixLayout(
    "root",
    buildHierarchy(explicitNodes, fixture.edges),
    new Map(explicitNodes.map((node) => [node.id, node]))
  );
  const geometry = (result: MatrixLayoutResult) => [result.header, ...result.cells]
    .map((cell) => ({
      id: cell.nodeId,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
    }))
    .sort((first, second) => first.id.localeCompare(second.id));

  assert.deepEqual(geometry(automatic), geometry(explicit));
  assertClean(automatic);
  assertClean(explicit);
});

test("returning an oriented Matrix control to Auto keeps its composition mode", () => {
  assert.equal(patchUsesOrientedMatrixComposition({ matrixChildFlow: undefined }), true);
  assert.equal(patchUsesOrientedMatrixComposition({ layoutFoldCount: undefined }), true);
  assert.equal(patchUsesOrientedMatrixComposition({ matrixOrientation: undefined }), true);
  assert.equal(patchUsesOrientedMatrixComposition({ text: "Unrelated edit" }), false);
});

test("unfolding the final row-flow branch preserves an earlier branch's row/column topology", () => {
  const fixture = buildTree([
    { id: "root", parentId: null, compositionMode: "oriented" },
    { id: "first", parentId: "root" },
    { id: "first-a", parentId: "first" },
    { id: "first-a-1", parentId: "first-a" },
    { id: "first-a-2", parentId: "first-a" },
    { id: "first-b", parentId: "first" },
    { id: "last", parentId: "root", childFlow: "row" },
    { id: "last-1", parentId: "last" },
    { id: "last-2", parentId: "last" },
    { id: "last-3", parentId: "last" },
    { id: "last-4", parentId: "last" },
    { id: "last-5", parentId: "last" },
  ]);
  const foldedNodes = fixture.nodes.map((node) => node.id === "last"
    ? { ...node, data: { ...node.data, layoutFoldCount: 2 } }
    : node);
  const folded = computeMatrixLayout(
    "root",
    buildHierarchy(foldedNodes, fixture.edges),
    new Map(foldedNodes.map((node) => [node.id, node]))
  );
  const unfolded = computeMatrixLayout(
    "root",
    buildHierarchy(fixture.nodes, fixture.edges),
    new Map(fixture.nodes.map((node) => [node.id, node]))
  );
  const firstBranchTopology = (result: MatrixLayoutResult) => {
    const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));
    const first = cells.get("first")!;
    const firstA = cells.get("first-a")!;
    const firstA1 = cells.get("first-a-1")!;
    const firstA2 = cells.get("first-a-2")!;
    const firstB = cells.get("first-b")!;
    return {
      childrenRemainBelowOneAnother:
        Math.abs(firstA.x - firstB.x) < 0.5
        && firstB.y > firstA.y + firstA.height,
      grandchildrenRemainBelowOneAnother:
        Math.abs(firstA1.x - firstA2.x) < 0.5
        && firstA2.y > firstA1.y + firstA1.height,
      descendantsRemainRightOfParents:
        firstA.x > first.x + first.width
        && firstA1.x > firstA.x + firstA.width,
    };
  };

  assert.deepEqual(firstBranchTopology(folded), {
    childrenRemainBelowOneAnother: true,
    grandchildrenRemainBelowOneAnother: true,
    descendantsRemainRightOfParents: true,
  });
  assert.deepEqual(firstBranchTopology(unfolded), firstBranchTopology(folded));
  assertClean(folded);
  assertClean(unfolded);
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
  assert.deepEqual(
    matrixTableOverrideResetAxes(
      { matrixWidthOverride: 310, matrixHeightOverride: 100 },
      true
    ),
    { width: false, height: false }
  );
});

test("resizing stacked or side-by-side children returns a horizontal parent height to Auto", () => {
  for (const [childFlow, expectedHeight] of [
    ["column", 208],
    ["row", 100],
  ] as const) {
    const { nodes, edges } = buildTree([
      { id: "root", parentId: null },
      {
        id: "parent",
        parentId: "root",
        childFlow,
        matrixWidth: 100,
        matrixHeight: 300,
      },
      { id: "a", parentId: "parent", matrixWidth: 100, matrixHeight: 100 },
      { id: "b", parentId: "parent", matrixWidth: 100, matrixHeight: 100 },
    ]);
    const ownedNodes = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        matrixRootId: "root",
        ...(node.id === "root" ? { layoutMode: "matrix" } : {}),
      },
    }));
    const hierarchy = buildHierarchy(ownedNodes, edges);
    const byId = new Map(ownedNodes.map((node) => [node.id, node]));
    const patch = { matrixHeightOverride: 100 };
    const resets = matrixAncestorSpanOverrideResets("a", patch, hierarchy, byId);

    assert.deepEqual(resets.get("parent"), { width: false, height: true });
    const resizedNodes = ownedNodes.map((node) => {
      if (node.id === "a") return { ...node, data: { ...node.data, ...patch } };
      const reset = resets.get(node.id);
      return reset?.height
        ? { ...node, data: { ...node.data, matrixHeightOverride: undefined } }
        : node;
    });
    const result = computeMatrixLayout(
      "root",
      buildHierarchy(resizedNodes, edges),
      new Map(resizedNodes.map((node) => [node.id, node]))
    );
    const parent = result.cells.find((cell) => cell.nodeId === "parent")!;

    assert.equal(parent.width, 100);
    assert.equal(parent.height, expectedHeight);
    assertClean(result);
  }
});

test("resizing side-by-side children returns a vertical parent width to Auto", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null },
    {
      id: "parent",
      parentId: "root",
      orientation: "vertical",
      childFlow: "row",
      matrixWidth: 300,
      matrixHeight: 100,
    },
    { id: "a", parentId: "parent", matrixWidth: 100, matrixHeight: 100 },
    { id: "b", parentId: "parent", matrixWidth: 100, matrixHeight: 100 },
  ]);
  const ownedNodes = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      matrixRootId: "root",
      ...(node.id === "root" ? { layoutMode: "matrix" } : {}),
    },
  }));
  const hierarchy = buildHierarchy(ownedNodes, edges);
  const byId = new Map(ownedNodes.map((node) => [node.id, node]));
  const patch = { matrixWidthOverride: 100 };
  const resets = matrixAncestorSpanOverrideResets("a", patch, hierarchy, byId);

  assert.deepEqual(resets.get("parent"), { width: true, height: false });
  const resizedNodes = ownedNodes.map((node) => {
    if (node.id === "a") return { ...node, data: { ...node.data, ...patch } };
    const reset = resets.get(node.id);
    return reset?.width
      ? { ...node, data: { ...node.data, matrixWidthOverride: undefined } }
      : node;
  });
  const result = computeMatrixLayout(
    "root",
    buildHierarchy(resizedNodes, edges),
    new Map(resizedNodes.map((node) => [node.id, node]))
  );
  const parent = result.cells.find((cell) => cell.nodeId === "parent")!;

  assert.equal(parent.width, MATRIX_HEADER_MIN_WIDTH);
  assert.equal(parent.height, 100);
  assertClean(result);
});

test("width-only Matrix resizing preserves a merged cell's rendered height", () => {
  assert.deepEqual(
    resolveMatrixCellResize(
      { width: 250, height: 1119 },
      250,
      { width: 300, height: 1119 }
    ),
    {
      width: 300,
      resetTableWidth: true,
      resetTableHeight: false,
    }
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

test("overall Matrix width and height overrides have no upper ceiling", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, matrixTableWidth: 12000, matrixTableHeight: 25000 },
    { id: "a", parentId: "root" },
    { id: "b", parentId: "root" },
    { id: "c", parentId: "root" },
  ]);
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));

  assert.equal(result.bounds.width, 12000);
  assert.equal(result.bounds.height, 25000);
  assert.equal(result.header.width, 12000);
  assert.equal(result.header.y, result.bounds.top);
  assertClean(result);
});

test("a locked overall Matrix keeps its bounds while a child receives more width", () => {
  const { nodes, edges } = buildTree([
    { id: "root", parentId: null, matrixTableWidth: 760, matrixTableHeight: 420 },
    { id: "a", parentId: "root", childFlow: "row" },
    { id: "a-1", parentId: "a", matrixWidth: 320 },
    { id: "a-2", parentId: "a" },
    { id: "a-3", parentId: "a" },
  ]);
  nodes[0] = {
    ...nodes[0],
    data: { ...nodes[0].data, matrixTableSizeLocked: true },
  };
  const hierarchy = buildHierarchy(nodes, edges);
  const result = computeMatrixLayout("root", hierarchy, new Map(nodes.map((node) => [node.id, node])));
  const cells = new Map(result.cells.map((cell) => [cell.nodeId, cell]));

  assert.equal(result.bounds.width, 760);
  assert.equal(result.bounds.height, 420);
  assert.ok(cells.get("a-1")!.width > cells.get("a-2")!.width);
  assert.ok(cells.get("a-1")!.width > cells.get("a-3")!.width);
  assertClean(result);
});

test("a nested Matrix pulls its outer parent close above the finished table", () => {
  const nodes: Node[] = [
    {
      id: "outer",
      type: "shape",
      position: { x: 80, y: 40 },
      measured: { width: 240, height: 72 },
      data: { layoutMode: "vertical", childOrder: ["matrix"] },
    },
    {
      id: "matrix",
      type: "shape",
      position: { x: 140, y: 340 },
      measured: { width: 1200, height: 96 },
      data: { parentId: "outer", childOrder: ["matrix-child"], layoutMode: "matrix" },
    },
    {
      id: "matrix-child",
      type: "shape",
      position: { x: 140, y: 444 },
      measured: { width: 1200, height: 80 },
      data: { parentId: "matrix", childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    { id: "outer-matrix", source: "outer", target: "matrix" },
    { id: "matrix-child", source: "matrix", target: "matrix-child" },
  ];
  const hierarchy = buildHierarchy(nodes, edges);
  const packed = packSiblingsAfterNestedMatrix(nodes, hierarchy, "matrix");
  const outer = getNodeRect(packed.find((node) => node.id === "outer")!);
  const matrix = getNodeRect(packed.find((node) => node.id === "matrix")!);

  assert.equal(outer.centerX, matrix.centerX);
  assert.equal(matrix.top - outer.bottom, NESTED_MATRIX_PARENT_GAP);
  assert.deepEqual(
    packed.find((node) => node.id === "matrix")!.position,
    nodes.find((node) => node.id === "matrix")!.position
  );
  assert.deepEqual(
    packed.find((node) => node.id === "matrix-child")!.position,
    nodes.find((node) => node.id === "matrix-child")!.position
  );

  const route = routeOrthogonalEdge(
    { x: outer.centerX, y: outer.bottom },
    { x: matrix.centerX, y: matrix.top },
    "bottom",
    "top",
    []
  );
  assert.deepEqual(route.points, [
    { x: outer.centerX, y: outer.bottom },
    { x: matrix.centerX, y: matrix.top },
  ]);
  assert.strictEqual(packSiblingsAfterNestedMatrix(packed, hierarchy, "matrix"), packed);
});

test("a Matrix directly under a List root keeps the List root left-aligned above it", () => {
  const nodes: Node[] = [
    {
      id: "outer",
      type: "shape",
      position: { x: 53, y: 191 },
      measured: { width: 203, height: 54 },
      data: { layoutMode: "list", listDensity: "compact", childOrder: ["matrix"] },
    },
    {
      id: "matrix",
      type: "shape",
      position: { x: 265, y: 160 },
      measured: { width: 377, height: 30 },
      data: { parentId: "outer", childOrder: ["matrix-child"], layoutMode: "matrix" },
    },
    {
      id: "matrix-child",
      type: "shape",
      position: { x: 265, y: 193 },
      measured: { width: 377, height: 83 },
      data: { parentId: "matrix", childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    { id: "outer-matrix", source: "outer", target: "matrix" },
    { id: "matrix-child", source: "matrix", target: "matrix-child" },
  ];
  const hierarchy = buildHierarchy(nodes, edges);
  const packed = packSiblingsAfterNestedMatrix(nodes, hierarchy, "matrix");
  const outer = getNodeRect(packed.find((node) => node.id === "outer")!);
  const matrix = getNodeRect(packed.find((node) => node.id === "matrix")!);

  assert.equal(
    packed.find((node) => node.id === "outer")!.position.x,
    nodes.find((node) => node.id === "outer")!.position.x
  );
  assert.equal(matrix.top - outer.bottom, LIST_DENSITIES.compact.rootToFirstRowGapY);
  assert.deepEqual(
    packed.find((node) => node.id === "matrix")!.position,
    nodes.find((node) => node.id === "matrix")!.position
  );
  assert.deepEqual(
    packed.find((node) => node.id === "matrix-child")!.position,
    nodes.find((node) => node.id === "matrix-child")!.position
  );
  assert.strictEqual(packSiblingsAfterNestedMatrix(packed, hierarchy, "matrix"), packed);
});

test("nested Matrix packing preserves a manually moved List root", () => {
  const nodes: Node[] = [
    {
      id: "outer",
      type: "shape",
      position: { x: 420, y: 72 },
      measured: { width: 203, height: 54 },
      data: {
        layoutMode: "list",
        listDensity: "compact",
        listManualOverride: true,
        childOrder: ["matrix"],
      },
    },
    {
      id: "matrix",
      type: "shape",
      position: { x: 265, y: 160 },
      measured: { width: 377, height: 30 },
      data: { parentId: "outer", childOrder: ["matrix-child"], layoutMode: "matrix" },
    },
    {
      id: "matrix-child",
      type: "shape",
      position: { x: 265, y: 193 },
      measured: { width: 377, height: 83 },
      data: { parentId: "matrix", childOrder: [] },
    },
  ];
  const edges: Edge[] = [
    { id: "outer-matrix", source: "outer", target: "matrix" },
    { id: "matrix-child", source: "matrix", target: "matrix-child" },
  ];
  const hierarchy = buildHierarchy(nodes, edges);

  assert.strictEqual(packSiblingsAfterNestedMatrix(nodes, hierarchy, "matrix"), nodes);
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
