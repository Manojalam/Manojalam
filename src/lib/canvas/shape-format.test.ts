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
    textColor: "#451a03",
    textAlign: "center",
  });

  assert.equal(format.fillColor, "#fef3c7");
  assert.equal(format.borderWidth, 3);
  assert.equal(format.fontSize, 18);
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

test("applies independent copies and opts generated targets out of automatic styling", () => {
  const format = captureShapeFormat({
    fillColor: "#ecfccb",
    borderLayers: [{ id: "layer", color: "#4d7c0f", width: 1, style: "solid" }],
  });
  const target = {
    text: "Destination content",
    shapeType: "ellipse",
    layoutVisualStyle: { fillColor: "#ffffff" },
  };
  const first = shapeFormatPatch(target, format);
  const second = shapeFormatPatch(target, format);

  assert.equal(first.fillColor, "#ecfccb");
  assert.equal(first.layoutAutoFill, false);
  assert.equal(first.layoutAutoBorder, false);
  assert.equal(first.layoutAutoText, false);
  assert.equal(first.layoutAutoTypography, false);
  assert.equal("text" in first, false);
  assert.equal("shapeType" in first, false);
  assert.notEqual(first.borderLayers, second.borderLayers);
});
