import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTextCalloutDirection,
  normalizeTextFrameStyle,
  speechBubblePath,
  textFrameBodyBox,
  textFrameContentSize,
  textFrameShapeType,
} from "./text-callout";

test("keeps existing text objects plain by default", () => {
  assert.equal(normalizeTextFrameStyle(undefined), "plain");
  assert.equal(normalizeTextFrameStyle("speech"), "speech");
  assert.equal(normalizeTextFrameStyle("thought"), "thought");
  assert.equal(normalizeTextFrameStyle("unknown"), "plain");
});

test("normalizes callout direction with a bottom-facing default", () => {
  assert.equal(normalizeTextCalloutDirection(undefined), "bottom");
  assert.equal(normalizeTextCalloutDirection("left"), "left");
  assert.equal(normalizeTextCalloutDirection("right"), "right");
  assert.equal(normalizeTextCalloutDirection("top"), "top");
});

test("reserves body space opposite the selected pointer direction", () => {
  assert.deepEqual(
    textFrameBodyBox("speech", "left"),
    { x: 20, y: 4, width: 76, height: 92 }
  );
  assert.deepEqual(
    textFrameBodyBox("speech", "bottom"),
    { x: 4, y: 4, width: 92, height: 76 }
  );
  assert.deepEqual(
    textFrameBodyBox("thought", "right"),
    { x: 4, y: 4, width: 80, height: 92 }
  );
});

test("maps frames to conservative auto-size shapes", () => {
  assert.equal(textFrameShapeType("plain"), "rectangle");
  assert.equal(textFrameShapeType("speech"), "callout");
  assert.equal(textFrameShapeType("thought"), "cloud");
});

test("keeps the bottom speech tail narrow with a softly rounded point", () => {
  const path = speechBubblePath("bottom");

  assert.match(path, /H55 L51\.5 96 Q50 99 48\.5 96 L45 80/);
  assert.doesNotMatch(path, /H62 L50 98 L38 80/);
});

test("calculates the editable area inside the bubble body", () => {
  assert.deepEqual(
    textFrameContentSize({ width: 200, height: 100 }, "speech", "left"),
    { width: 136, height: 76 }
  );
  assert.deepEqual(
    textFrameContentSize({ width: 200, height: 100 }, "plain", "bottom"),
    { width: 184, height: 84 }
  );
});
