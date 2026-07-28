import assert from "node:assert/strict";
import test from "node:test";
import { Editor } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";

import {
  applyRichTextCommandAcrossRanges,
  appendRichTextSelectionRange,
  canShowInlineTextToolbar,
  comparableRichTextColor,
  isTextToolFocusTarget,
  normalizeRichTextSelectionRanges,
  resolveRichTextAdditiveSelectionRanges,
  resolveCapturedTextAlign,
  resolveRichTextFormattingRanges,
  shouldKeepRichTextEditingActive,
  TEXT_TOOL_FOCUS_SELECTOR,
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

test("portaled symbol and color controls remain part of the text editing session", () => {
  assert.equal(isTextToolFocusTarget({
    closest: (selector: string) => selector === TEXT_TOOL_FOCUS_SELECTOR ? {} : null,
  }), true);
  assert.equal(isTextToolFocusTarget({ closest: () => null }), false);
  assert.equal(isTextToolFocusTarget(null), false);
});

test("open color pickers keep the editor active when blur has no related target", () => {
  const inactiveFormattingSurfaces = {
    focusMovedToToolbar: false,
    focusMovedToTextTool: false,
    textColorPickerOpen: false,
    highlightPickerOpen: false,
    linkDialogOpen: false,
    colorReplaceDialogOpen: false,
  };

  assert.equal(shouldKeepRichTextEditingActive({
    ...inactiveFormattingSurfaces,
    textColorPickerOpen: true,
  }), true);
  assert.equal(shouldKeepRichTextEditingActive({
    ...inactiveFormattingSurfaces,
    highlightPickerOpen: true,
  }), true);
  assert.equal(shouldKeepRichTextEditingActive(inactiveFormattingSurfaces), false);
});

test("additive text ranges are ordered, clamped, and merged", () => {
  assert.deepEqual(normalizeRichTextSelectionRanges([
    { from: 12, to: 18 },
    { from: 8, to: 4 },
    { from: 7, to: 14 },
    { from: 25, to: 25 },
    { from: 40, to: 60 },
  ], 50), [
    { from: 4, to: 18 },
    { from: 40, to: 50 },
  ]);
});

test("an additive text range remains separate when it is disjoint", () => {
  assert.deepEqual(appendRichTextSelectionRange([
    { from: 2, to: 5 },
    { from: 12, to: 18 },
  ], { from: 7, to: 9 }, 30), [
    { from: 2, to: 5 },
    { from: 7, to: 9 },
    { from: 12, to: 18 },
  ]);
});

test("additive selection combines the retained and browser-native ranges", () => {
  assert.deepEqual(resolveRichTextAdditiveSelectionRanges({
    baseRanges: [{ from: 2, to: 6 }],
    browserRanges: [{ from: 12, to: 17 }],
    editorRange: { from: 12, to: 17 },
    maximumPosition: 30,
  }), [
    { from: 2, to: 6 },
    { from: 12, to: 17 },
  ]);
});

test("drag coordinates recover a range when browser and editor selections collapse", () => {
  assert.deepEqual(resolveRichTextAdditiveSelectionRanges({
    baseRanges: [{ from: 2, to: 6 }],
    browserRanges: [],
    editorRange: null,
    dragRange: { from: 20, to: 12 },
    maximumPosition: 30,
  }), [
    { from: 2, to: 6 },
    { from: 12, to: 20 },
  ]);
});

test("picker formatting keeps the ranges captured before native selection changes", () => {
  assert.deepEqual(resolveRichTextFormattingRanges({
    currentRanges: [{ from: 18, to: 22 }],
    preservedRanges: [{ from: 2, to: 6 }, { from: 10, to: 14 }],
    maximumPosition: 30,
  }), [
    { from: 2, to: 6 },
    { from: 10, to: 14 },
  ]);
});

test("formatting is applied to every retained text range", () => {
  const editor = new Editor({
    extensions: [StarterKit, TextStyle, Color],
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
        { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
        { type: "paragraph", content: [{ type: "text", text: "charlie" }] },
      ],
    },
  });

  try {
    assert.equal(applyRichTextCommandAcrossRanges(
      editor,
      [{ from: 1, to: 6 }, { from: 8, to: 13 }],
      (chain) => chain.setColor("#ef4444"),
      { focus: false }
    ), true);

    const coloredWords: string[] = [];
    editor.state.doc.descendants((node) => {
      if (
        node.isText
        && node.marks.some((mark) =>
          mark.type.name === "textStyle" && mark.attrs.color === "#ef4444")
      ) {
        coloredWords.push(node.text ?? "");
      }
    });
    assert.deepEqual(coloredWords, ["alpha", "bravo"]);
    assert.equal(editor.state.doc.textContent, "alphabravocharlie");
  } finally {
    editor.destroy();
  }
});

test("persisted rich-text colors compare case and whitespace insensitively", () => {
  assert.equal(comparableRichTextColor(" #22C55E "), "#22c55e");
  assert.equal(comparableRichTextColor("rgb(34, 197, 94)"), "rgb(34,197,94)");
  assert.equal(comparableRichTextColor("   "), null);
  assert.equal(comparableRichTextColor(undefined), null);
});
