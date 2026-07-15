import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateFlowerLabelTextWidth,
  flowerLabelAvailableWidth,
  layoutFlowerLabels,
} from "./flower-label-flow";

test("short targets flow left-to-right into centered rows instead of columns", () => {
  const result = layoutFlowerLabels({
    sourceText: "Earth",
    targetLabels: ["form", "touch", "taste", "smell", "number", "measure"],
    regionWidth: 300,
    regionHeight: 190,
    sourceFontSize: 16,
    targetFontSize: 12,
  });

  assert.equal(result.overflowed, false);
  assert.ok(result.rows.length < result.targets.length);
  assert.deepEqual(
    result.targets.map((target) => target.targetIndex),
    [0, 1, 2, 3, 4, 5]
  );
  result.rows.forEach((row) => {
    const placements = result.targets.filter((target) => target.rowIndex === row.index);
    const left = Math.min(...placements.map((target) => target.bulletX));
    const right = Math.max(...placements.map((target) => target.labelX + target.width));
    assert.ok(Math.abs(left + right) < 18, `row ${row.index} is not centered`);
  });
});

test("long targets consume more horizontal space while short labels still share rows", () => {
  const widths = new Map([
    ["a", 18],
    ["an unusually long relationship", 184],
    ["b", 18],
    ["c", 18],
  ]);
  const result = layoutFlowerLabels({
    sourceText: "Source",
    targetLabels: [...widths.keys()],
    regionWidth: 300,
    regionHeight: 210,
    sourceFontSize: 16,
    targetFontSize: 12,
    measureText: (value, fontSize) => widths.get(value) ?? Array.from(value).length * fontSize * 0.55,
  });

  const long = result.targets[1];
  assert.ok(long.width > result.targets[0].width * 3);
  assert.ok(result.rows.some((row) => row.targetIndexes.length > 1));
  assert.deepEqual(result.targets.map((target) => target.targetIndex), [0, 1, 2, 3]);
});

test("the whole content cluster stays compact and centered near the region center", () => {
  const result = layoutFlowerLabels({
    sourceText: "Water",
    targetLabels: ["form", "division", "after", "not-after", "guru", "liquid", "affection"],
    regionWidth: 330,
    regionHeight: 250,
    sourceFontSize: 17,
    targetFontSize: 12,
  });

  assert.equal(result.overflowed, false);
  assert.ok(result.bounds.top < 0);
  assert.ok(result.bounds.bottom > 0);
  assert.ok(Math.abs(result.bounds.top + result.bounds.bottom) < 0.001);
  assert.ok(result.bounds.bottom - result.bounds.top < 250 * 0.75);
  assert.ok(result.source.y < 0);
  assert.ok(result.targets.every((target) => target.y > result.source.y));
});

test("font size adapts when the preferred size does not fit", () => {
  const result = layoutFlowerLabels({
    sourceText: "Source",
    targetLabels: [
      "relationship one",
      "relationship two",
      "relationship three",
      "relationship four",
      "relationship five",
      "relationship six",
    ],
    regionWidth: 230,
    regionHeight: 190,
    sourceFontSize: 17,
    targetFontSize: 16,
    minimumTargetFontSize: 9,
  });

  assert.equal(result.overflowed, false);
  assert.ok(result.targetFontSize < 16);
  assert.ok(result.targetFontSize >= 9);
  assert.ok(result.source.fontSize >= result.targetFontSize * 1.12 - 0.001);
});

test("a huge preferred font safely down-fits fourteen Sanskrit labels", () => {
  const targets = [
    "\u092a\u0943\u0925\u094d\u0935\u0940",
    "\u091c\u0932\u092e\u094d",
    "\u0924\u0947\u091c\u0903",
    "\u0935\u093e\u092f\u0941\u0903",
    "\u0906\u0915\u093e\u0936\u0903",
    "\u092e\u0928\u0903",
    "\u0906\u0924\u094d\u092e\u093e",
    "\u0915\u093e\u0932\u0903",
    "\u0926\u093f\u0915\u094d",
    "\u0936\u092c\u094d\u0926\u0903",
    "\u0938\u094d\u092a\u0930\u094d\u0936\u0903",
    "\u0930\u0942\u092a\u092e\u094d",
    "\u0930\u0938\u0903",
    "\u0917\u0928\u094d\u0927\u0903",
  ];
  const result = layoutFlowerLabels({
    sourceText: "\u092a\u0943\u0925\u094d\u0935\u0940 (14)",
    targetLabels: targets,
    regionWidth: 174,
    regionHeight: 174,
    sourceFontSize: 64.8,
    targetFontSize: 48.96,
    minimumSourceFontSize: 8.5,
    minimumTargetFontSize: 7,
    density: "compact",
  });

  assert.equal(result.overflowed, false);
  assert.equal(result.targets.length, targets.length);
  assert.ok(result.source.fontSize < 64.8);
  assert.ok(result.targetFontSize < 48.96);
  assert.ok(result.source.fontSize >= result.targetFontSize * 1.12 - 0.001);
  assert.ok(result.bounds.top >= -73 - 0.001);
  assert.ok(result.bounds.bottom <= 73 + 0.001);
  result.rows.forEach((row) => {
    assert.ok(row.width <= row.availableWidth + 0.001);
  });
});

test("every row respects the petal width available across its full height", () => {
  const result = layoutFlowerLabels({
    sourceText: "Center",
    targetLabels: Array.from({ length: 10 }, (_, index) => `item ${index + 1}`),
    regionWidth: 280,
    regionHeight: 190,
    sourceFontSize: 15,
    targetFontSize: 11,
    density: "compact",
  });

  assert.equal(result.overflowed, false);
  result.rows.forEach((row) => {
    assert.ok(row.width <= row.availableWidth + 0.001);
    assert.equal(
      row.availableWidth,
      flowerLabelAvailableWidth(252, 166, row.y, Math.max(...result.rows.map((item) => item.height)))
    );
  });
});

test("a too-small region returns finite fallback placements and reports overflow", () => {
  const result = layoutFlowerLabels({
    sourceText: "A source name that cannot fit",
    targetLabels: ["one", "two", "three", "four"],
    regionWidth: 60,
    regionHeight: 40,
    sourceFontSize: 18,
    targetFontSize: 14,
  });

  assert.equal(result.overflowed, true);
  assert.ok(result.source.fontSize >= result.targetFontSize * 1.12 - 0.001);
  assert.ok(Number.isFinite(result.bounds.top));
  assert.ok(Number.isFinite(result.bounds.bottom));
  result.targets.forEach((target) => {
    assert.ok(Number.isFinite(target.labelX));
    assert.ok(Number.isFinite(target.y));
  });
});

test("Devanagari conjuncts use grapheme-aware width estimates", () => {
  const conjunct = layoutFlowerLabels({
    sourceText: "द्रव्यगुणसम्बन्धः",
    targetLabels: ["पृथ्वी", "आपः", "तेजः", "वायुः", "आकाशः"],
    regionWidth: 176,
    regionHeight: 176,
    sourceFontSize: 14,
    targetFontSize: 10,
    minimumTargetFontSize: 8,
    density: "compact",
  });

  assert.equal(conjunct.overflowed, false);
  assert.equal(conjunct.targets.length, 5);
  assert.ok(conjunct.rows.some((row) => row.targetIndexes.length > 1));
  assert.ok(
    estimateFlowerLabelTextWidth("\u092a\u0943\u0925\u094d\u0935\u0940", 10)
      > 2 * 10 * 0.62
  );
});
