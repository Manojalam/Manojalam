import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import {
  POWERPOINT_SLIDE,
  buildPowerPointTransform,
  editableNodeText,
  plainPowerPointText,
  powerPointColor,
  powerPointShapeName,
  safePowerPointFilename,
  transformNodeRect,
} from "./powerpoint-layout";

function node(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown> = {},
  type = "shape"
): Node {
  return {
    id,
    type,
    position: { x, y },
    width,
    height,
    data,
  };
}

test("converts authored CSS colors without flattening opacity", () => {
  assert.deepEqual(powerPointColor("#3b82f6"), { color: "3B82F6", transparency: 0 });
  assert.deepEqual(powerPointColor("#0f08"), { color: "00FF00", transparency: 47 });
  assert.deepEqual(powerPointColor("rgba(10, 20, 30, 0.25)"), {
    color: "0A141E",
    transparency: 75,
  });
  assert.deepEqual(powerPointColor("transparent"), { color: "6366F1", transparency: 100 });
});

test("turns rich board text into editable PowerPoint text", () => {
  assert.equal(
    plainPowerPointText("<p>First &amp; second</p><p>Third<br>line</p>"),
    "First & second\nThird\nline"
  );
  assert.equal(
    editableNodeText(node("grammar", 0, 0, 180, 80, {
      topic: "Sandhi",
      category: "Grammar",
      rule: "Combine adjacent sounds",
      examples: ["a + i", "ā + i"],
    }, "grammar")),
    "Sandhi\nGrammar\nCombine adjacent sounds\na + i • ā + i"
  );
});

test("maps board shapes to native editable PowerPoint shapes", () => {
  assert.equal(powerPointShapeName("diamond"), "diamond");
  assert.equal(powerPointShapeName("database"), "can");
  assert.equal(powerPointShapeName("document"), "flowChartDocument");
  assert.equal(powerPointShapeName("flower"), "sun");
  assert.equal(powerPointShapeName("leaf"), "teardrop");
});

test("fits every teaching-stop node inside the widescreen content area", () => {
  const nodes = [
    node("root", -800, -250, 260, 120),
    node("child", 1200, 700, 400, 220),
    node("middle", 100, 80, 180, 80),
  ];
  const transform = buildPowerPointTransform(nodes);
  for (const item of nodes) {
    const rect = transformNodeRect(item, transform);
    assert.ok(rect.x >= POWERPOINT_SLIDE.content.x - 1e-9);
    assert.ok(rect.y >= POWERPOINT_SLIDE.content.y - 1e-9);
    assert.ok(rect.x + rect.width <= POWERPOINT_SLIDE.content.x + POWERPOINT_SLIDE.content.width + 1e-9);
    assert.ok(rect.y + rect.height <= POWERPOINT_SLIDE.content.y + POWERPOINT_SLIDE.content.height + 1e-9);
  }
});

test("creates safe PowerPoint filenames", () => {
  assert.equal(safePowerPointFilename("  Lesson: roots / branches?  "), "Lesson- roots - branches-.pptx");
  assert.equal(safePowerPointFilename(""), "Teaching chart.pptx");
});
