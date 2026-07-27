import assert from "node:assert/strict";
import test from "node:test";

import { captureShapeFormat, shapeFormatPatch } from "./shape-format";

test("captures shape appearance without content or structural data", () => {
  const borderLayers = [{ id: "layer", color: "#334155", width: 2, style: "dashed" }];
  const format = captureShapeFormat({
    text: "Keep this on the source",
    richText: "<p>Source</p>",
    parentId: "parent",
    shapeType: "diamond",
    fillColor: "#fef3c7",
    fillOpacity: 0.8,
    borderColor: "#92400e",
    borderWidth: 3,
    borderStyle: "dashed",
    borderLayers,
    fontSize: 18,
    fontFamily: "serif",
    fontWeight: "bold",
    textColor: "#451a03",
    textAlign: "center",
  });

  assert.equal(format.fillColor, "#fef3c7");
  assert.equal(format.borderWidth, 3);
  assert.equal(format.fontSize, 18);
  assert.equal(format.fontFamily, "serif");
  assert.equal(format.fontWeight, "bold");
  assert.equal(format.textColor, "#451a03");
  assert.equal(format.textAlign, "center");
  assert.deepEqual(format.borderLayers, borderLayers);
  assert.notEqual(format.borderLayers, borderLayers);
  assert.equal("text" in format, false);
  assert.equal("richText" in format, false);
  assert.equal("parentId" in format, false);
  assert.equal("shapeType" in format, false);
});

test("captures the visible generated layout style as an explicit format", () => {
  const format = captureShapeFormat({
    fillColor: "#ffffff",
    borderColor: "#000000",
    fontSize: 11,
    layoutVisualStyle: {
      fillColor: "#dbeafe",
      borderColor: "#2563eb",
      borderWidth: 4,
      borderStyle: "solid",
      textColor: "#172554",
      fontSize: 16,
    },
  });

  assert.equal(format.fillColor, "#dbeafe");
  assert.equal(format.fillOpacity, 1);
  assert.equal(format.borderColor, "#2563eb");
  assert.equal(format.borderWidth, 4);
  assert.equal(format.textColor, "#172554");
  assert.equal(format.fontSize, 16);
});

test("copies whole-shape text formatting without changing embedded sticker markup", () => {
  const format = captureShapeFormat({
    fillColor: "#ecfccb",
    borderLayers: [{ id: "layer", color: "#4d7c0f", width: 1, style: "solid" }],
    fontSize: 28,
    textColor: "#854d0e",
    textHighlightColor: "#fde68a",
  });
  const target = {
    text: "Destination content",
    richText: '<p><span style="color: #1d4ed8">क</span><span style="color: #ffffff">अ</span></p>',
    shapeType: "ellipse",
    fontSize: 20,
    textColor: "#1e3a8a",
    textHighlightColor: "#bfdbfe",
    layoutAutoText: true,
    layoutAutoTypography: true,
    layoutVisualStyle: { fillColor: "#ffffff" },
  };
  const first = shapeFormatPatch(target, format);
  const second = shapeFormatPatch(target, format);
  const updated = { ...target, ...first };

  assert.equal(first.fillColor, "#ecfccb");
  assert.equal(first.layoutAutoFill, false);
  assert.equal(first.layoutAutoBorder, false);
  assert.equal(first.layoutAutoText, false);
  assert.equal(first.layoutAutoTypography, false);
  assert.equal(updated.richText, target.richText);
  assert.equal(updated.fontSize, 28);
  assert.equal(updated.textColor, "#854d0e");
  assert.equal(updated.textHighlightColor, "#fde68a");
  assert.equal(updated.layoutAutoText, false);
  assert.equal(updated.layoutAutoTypography, false);
  assert.equal("text" in first, false);
  assert.equal("shapeType" in first, false);
  assert.notEqual(first.borderLayers, second.borderLayers);
});
