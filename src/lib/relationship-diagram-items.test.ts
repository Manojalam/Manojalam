import assert from "node:assert/strict";
import test from "node:test";

import {
  singleRelationshipItemId,
  splitSingleSourceRelationshipItems,
  type RelationshipDiagramItemGroup,
} from "./relationship-diagram-items";

function group(
  sourceNodeId: string,
  targets: RelationshipDiagramItemGroup["targets"]
): RelationshipDiagramItemGroup {
  return {
    itemId: sourceNodeId,
    sourceNodeId,
    sourceColor: "#334155",
    targets,
    count: targets.length,
  };
}

test("single-source relationships become independently keyed diagram items", () => {
  const items = splitSingleSourceRelationshipItems([
    group("source", [
      { id: "target-a", label: "Target A", color: "#ef4444" },
      { id: "target-b", label: "Target B", color: "#3b82f6" },
    ]),
  ]);

  assert.deepEqual(items.map((item) => ({
    itemId: item.itemId,
    itemLabel: item.itemLabel,
    sourceColor: item.sourceColor,
    targetIds: item.targets.map((target) => target.id),
    count: item.count,
  })), [
    {
      itemId: singleRelationshipItemId("source", "target-a"),
      itemLabel: "Target A",
      sourceColor: "#ef4444",
      targetIds: ["target-a"],
      count: 1,
    },
    {
      itemId: singleRelationshipItemId("source", "target-b"),
      itemLabel: "Target B",
      sourceColor: "#3b82f6",
      targetIds: ["target-b"],
      count: 1,
    },
  ]);
});

test("multi-source groups retain their source-level items", () => {
  const groups = [
    group("source-a", [{ id: "target-a", label: "Target A" }]),
    group("source-b", [{ id: "target-b", label: "Target B" }]),
  ];

  assert.deepEqual(splitSingleSourceRelationshipItems(groups), groups);
});
