import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultTextCalloutAnchor,
  defaultTextCalloutTip,
  normalizeTextCalloutAnchor,
  normalizeTextCalloutDirection,
  normalizeTextFrameStyle,
  relativeTextCalloutTip,
  speechBubblePath,
  textFrameBodyBox,
  textFrameContentSize,
  textFrameShapeType,
  translateTextCalloutAnchor,
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
    { x: 4, y: 4, width: 92, height: 92 }
  );
  assert.deepEqual(
    textFrameBodyBox("speech", "bottom"),
    { x: 4, y: 4, width: 92, height: 92 }
  );
  assert.deepEqual(
    textFrameBodyBox("thought", "right"),
    { x: 4, y: 4, width: 80, height: 92 }
  );
});

test("maps frames to conservative auto-size shapes", () => {
  assert.equal(textFrameShapeType("plain"), "rectangle");
  assert.equal(textFrameShapeType("speech"), "rectangle");
  assert.equal(textFrameShapeType("thought"), "cloud");
});

test("draws a narrow speech tail to an independently positioned tip", () => {
  const path = speechBubblePath(
    "left",
    { width: 240, height: 80 },
    { x: -140, y: 20 }
  );

  assert.match(path, /L-140 20/);
  assert.match(path, /Q3 77 3 63/);
  assert.doesNotMatch(path, /50 99/);
});

test("keeps an anchored pointer fixed when the speech body moves", () => {
  const size = { width: 240, height: 80 };
  const initialPosition = { x: 100, y: 200 };
  const anchor = defaultTextCalloutAnchor(initialPosition, size, "left");

  assert.deepEqual(defaultTextCalloutTip(size, "left"), { x: -30.4, y: 40 });
  assert.deepEqual(anchor, { x: 69.6, y: 240 });
  assert.deepEqual(
    relativeTextCalloutTip({ x: 180, y: 260 }, size, "left", anchor),
    { x: -110.4, y: -20 }
  );
});

test("normalizes and translates persisted pointer anchors", () => {
  assert.deepEqual(
    normalizeTextCalloutAnchor({ x: 12, y: -4 }),
    { x: 12, y: -4 }
  );
  assert.equal(normalizeTextCalloutAnchor({ x: "12", y: -4 }), null);
  assert.equal(normalizeTextCalloutAnchor(undefined), null);
  assert.deepEqual(
    translateTextCalloutAnchor({ x: 12, y: -4 }, { x: 40, y: 60 }),
    { x: 52, y: 56 }
  );
});

test("calculates the editable area inside the bubble body", () => {
  assert.deepEqual(
    textFrameContentSize({ width: 200, height: 100 }, "speech", "left"),
    { width: 168, height: 76 }
  );
  assert.deepEqual(
    textFrameContentSize({ width: 200, height: 100 }, "plain", "bottom"),
    { width: 184, height: 84 }
  );
});
