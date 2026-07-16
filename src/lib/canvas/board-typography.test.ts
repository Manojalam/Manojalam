import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import {
  applyBoardFontSize,
  normalizeBoardFontSize,
  supportsBoardTypography,
} from "./board-typography";

function node(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data };
}

test("board font size updates every common text-bearing canvas node", () => {
  const nodes = [
    node("shape", "shape", { richText: '<p style="font-size: 28px; color: red">Shape</p>' }),
    node("sticky", "sticky"),
    node("text", "text", { externalNote: true }),
    node("mindmap", "mindmap", { layoutVisualStyle: "level" }),
    node("card", "sanskrit", { fontSize: 20 }),
    node("chart", "sunburst", { fontSize: 20 }),
  ];

  const updated = applyBoardFontSize(nodes, 18);

  for (const id of ["shape", "sticky", "text", "mindmap"]) {
    assert.equal(updated.find((candidate) => candidate.id === id)?.data.fontSize, 18);
  }
  assert.doesNotMatch(String(updated[0].data.richText), /font-size/i);
  assert.equal(updated[3].data.layoutAutoTypography, false);
  assert.equal(updated[4], nodes[4]);
  assert.equal(updated[5], nodes[5]);
});

test("board font-size support and limits are explicit", () => {
  assert.equal(supportsBoardTypography(node("note", "text")), true);
  assert.equal(supportsBoardTypography(node("frame", "frame")), false);
  assert.equal(normalizeBoardFontSize(4), 8);
  assert.equal(normalizeBoardFontSize(200), 96);
  assert.equal(normalizeBoardFontSize(17.6), 18);
});
