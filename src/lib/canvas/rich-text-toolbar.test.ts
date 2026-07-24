import assert from "node:assert/strict";
import test from "node:test";

import {
  canShowInlineTextToolbar,
  resolveCapturedTextAlign,
} from "./rich-text-toolbar";

const focusedSelection = {
  nodeId: "node-a",
  selectedNodeIds: ["node-a"],
  editorEditable: true,
  editorFocused: true,
  hasTextSelection: true,
};

test("a focused text selection in the sole selected node owns one toolbar", () => {
  assert.equal(canShowInlineTextToolbar(focusedSelection), true);
});

test("multi-object selection never mounts per-node inline toolbars", () => {
  assert.equal(canShowInlineTextToolbar({
    ...focusedSelection,
    selectedNodeIds: ["node-a", "node-b", "node-c"],
  }), false);
});

test("programmatic bulk formatting cannot open an unfocused editor toolbar", () => {
  assert.equal(canShowInlineTextToolbar({
    ...focusedSelection,
    editorFocused: false,
  }), false);
});

test("a collapsed caret does not show the selection toolbar", () => {
  assert.equal(canShowInlineTextToolbar({
    ...focusedSelection,
    hasTextSelection: false,
  }), false);
});

test("format capture preserves the selected paragraph's rendered alignment", () => {
  assert.equal(resolveCapturedTextAlign(null, "center", undefined), "center");
  assert.equal(resolveCapturedTextAlign(undefined, "right", "center"), "right");
});

test("explicit paragraph alignment wins over inherited node alignment", () => {
  assert.equal(resolveCapturedTextAlign("justify", "center", "right"), "justify");
});

test("format capture uses the node fallback before defaulting to left", () => {
  assert.equal(resolveCapturedTextAlign(undefined, "start", "center"), "center");
  assert.equal(resolveCapturedTextAlign(undefined, undefined, undefined), "left");
});
