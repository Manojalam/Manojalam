import assert from "node:assert/strict";
import test from "node:test";
import {
  isHierarchyRadialChartActive,
  relationshipDiagramSourceIds,
} from "./chart-selection";

const chartNodeIds = new Set(["root", "sector-a", "sector-b"]);

test("radial chart controls stay active while a source sector is selected", () => {
  assert.equal(isHierarchyRadialChartActive(false, ["sector-a"], chartNodeIds), true);
  assert.equal(isHierarchyRadialChartActive(false, ["sector-a", "sector-b"], chartNodeIds), true);
  assert.equal(isHierarchyRadialChartActive(false, ["unrelated"], chartNodeIds), false);
});

test("mixed selections do not expose independent chart controls", () => {
  assert.equal(isHierarchyRadialChartActive(false, ["sector-a", "unrelated"], chartNodeIds), false);
});

test("selecting the chart wrapper directly keeps its controls active", () => {
  assert.equal(isHierarchyRadialChartActive(true, [], chartNodeIds), true);
});

test("a single selected source with a saved relationship can generate a diagram", () => {
  assert.deepEqual(
    relationshipDiagramSourceIds(
      ["sector-a"],
      [{ sourceNodeId: "sector-a" }]
    ),
    ["sector-a"]
  );
});

test("diagram sources exclude unrelated selections and preserve selection order", () => {
  assert.deepEqual(
    relationshipDiagramSourceIds(
      ["sector-b", "unrelated", "sector-a", "sector-b"],
      [{ sourceNodeId: "sector-a" }, { sourceNodeId: "sector-b" }]
    ),
    ["sector-b", "sector-a"]
  );
  assert.deepEqual(
    relationshipDiagramSourceIds(["unrelated"], [{ sourceNodeId: "sector-a" }]),
    []
  );
});
