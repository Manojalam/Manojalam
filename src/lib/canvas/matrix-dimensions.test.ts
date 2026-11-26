import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { buildHierarchy } from "../layout/hierarchy";
import { computeMatrixLayout } from "../layout/matrix-layout";
import { applyMatrixDimensions, copyMatrixDimensions, resetMatrixDimensions } from "./matrix-dimensions";

function fixture(prefix: string, fontSize: number): Node[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `${prefix}${i}`, type: "shape", position: { x: 0, y: 0 },
    data: {
      text: i ? "राम" : "Header", fontSize, fillColor: prefix === "a" ? "red" : "blue",
      ...(i ? { parentId: `${prefix}0`, matrixRootId: `${prefix}0` } : {
        layoutMode: "matrix", layoutFoldCount: 3,
        childOrder: Array.from({ length: 9 }, (_, j) => `${prefix}${j + 1}`),
      }),
    },
  }));
}
function layout(nodes: Node[], root = nodes[0].id) {
  return computeMatrixLayout(root, buildHierarchy(nodes, []), new Map(nodes.map(node => [node.id, node])));
}
function rendered(nodes: Node[]): Node[] {
  const result = layout(nodes);
  const cells = new Map([result.header, ...result.cells].map(cell => [cell.nodeId, cell]));
  return nodes.map(node => {
    const cell = cells.get(node.id)!;
    return { ...node, position: { x: cell.x, y: cell.y }, style: { width: cell.width, height: cell.height } };
  });
}

test("copy matches folded matrix dimensions despite different text formatting, preserving content", () => {
  const source = rendered(fixture("a", 32));
  const target = fixture("b", 18);
  const snapshot = copyMatrixDimensions("a0", buildHierarchy(source, []), source);
  const applied = applyMatrixDimensions(snapshot, "b0", buildHierarchy(target, []), target)!;
  const before = layout(source), after = layout(applied);
  assert.equal(after.bounds.width, before.bounds.width);
  assert.equal(after.bounds.height, before.bounds.height);
  const sizes = (result: ReturnType<typeof layout>) => [result.header, ...result.cells].map(cell => [cell.width, cell.height]);
  assert.deepEqual(sizes(after), sizes(before));
  assert.equal(applied[1].data.fillColor, "blue");
  assert.equal(applied[1].data.fontSize, 18);
  assert.equal(applied[1].data.text, "राम");
  assert.equal(applyMatrixDimensions(snapshot, "b0", buildHierarchy(target.slice(0, 4), []), target.slice(0, 4)), null);
});

test("whole-matrix Auto removes old cell and overall constraints, retaining the other axis", () => {
  const base = fixture("a", 24);
  const stale = base.map(node => ({ ...node, data: { ...node.data,
    matrixWidthOverride: 400, matrixHeightOverride: 150,
    matrixTableWidthOverride: 1400, matrixTableHeightOverride: 800, matrixTableSizeLocked: true,
  } }));
  const hierarchy = buildHierarchy(stale, []);
  const widths = resetMatrixDimensions("a0", hierarchy, stale, "width");
  assert.equal(widths[0].data.matrixTableWidthOverride, undefined);
  assert.equal(widths[0].data.matrixTableHeightOverride, 800);
  assert.ok(widths.every(node => node.data.matrixWidthOverride === undefined));
  const both = resetMatrixDimensions("a0", hierarchy, widths, "height");
  assert.deepEqual(layout(both).bounds, layout(base).bounds);
});
