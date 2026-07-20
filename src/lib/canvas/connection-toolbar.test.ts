import assert from "node:assert/strict";
import test from "node:test";

import { canShowConnectionToolbar } from "./connection-toolbar";

const singleConnector = {
  selected: true,
  selectedNodeIds: [],
  selectedEdgeIds: ["edge-a"],
  logicalEdgeIds: ["edge-a"],
};

test("a singly selected connector owns one editor toolbar", () => {
  assert.equal(canShowConnectionToolbar(singleConnector), true);
});

test("all segments of one logical connector still own one editor toolbar", () => {
  assert.equal(canShowConnectionToolbar({
    ...singleConnector,
    selectedEdgeIds: ["edge-a", "edge-b"],
    logicalEdgeIds: ["edge-a", "edge-b"],
  }), true);
});

test("bulk connector selection does not mount per-edge editor toolbars", () => {
  assert.equal(canShowConnectionToolbar({
    ...singleConnector,
    selectedEdgeIds: ["edge-a", "edge-c"],
  }), false);
});

test("mixed node and connector selection does not mount a connector toolbar", () => {
  assert.equal(canShowConnectionToolbar({
    ...singleConnector,
    selectedNodeIds: ["node-a"],
  }), false);
});

test("stale persisted selection flags cannot mount a toolbar without live selection state", () => {
  assert.equal(canShowConnectionToolbar({
    ...singleConnector,
    selectedEdgeIds: [],
  }), false);
});
