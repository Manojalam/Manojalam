import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { applyStructuredReflowPlacement } from "./structured-reflow";

function overriddenNode(position = { x: 40, y: 70 }): Node {
  return {
    id: "node",
    type: "shape",
    position,
    data: { text: "Node", treeManualOverride: true },
  };
}

test("ordinary structured reflow preserves a manual tree position", () => {
  const node = overriddenNode();
  assert.equal(applyStructuredReflowPlacement(node, { x: 180, y: 220 }, false), node);
});

test("an explicit Fold reflow applies its position and clears the stale override", () => {
  const result = applyStructuredReflowPlacement(overriddenNode(), { x: 180, y: 220 }, true);

  assert.deepEqual(result.position, { x: 180, y: 220 });
  assert.equal("treeManualOverride" in (result.data as Record<string, unknown>), false);
});

test("an explicit Fold clears an override even when the calculated position is unchanged", () => {
  const result = applyStructuredReflowPlacement(overriddenNode(), { x: 40, y: 70 }, true);

  assert.deepEqual(result.position, { x: 40, y: 70 });
  assert.equal("treeManualOverride" in (result.data as Record<string, unknown>), false);
});
