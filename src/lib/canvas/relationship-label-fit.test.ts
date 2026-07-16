import assert from "node:assert/strict";
import test from "node:test";

import { fitRelationshipLabel } from "./relationship-label-fit";

const measureText = (value: string, fontSize: number) => value.length * fontSize * 0.6;

test("maximize mode grows a short label to the largest size allowed by its region", () => {
  const result = fitRelationshipLabel({
    value: "Earth",
    maximumWidth: 180,
    maximumHeight: 42,
    preferredFontSize: 12,
    maximumLines: 1,
    lineHeight: 1.35,
    maximize: true,
    measureText,
  });

  assert.equal(result.overflowed, false);
  assert.ok(result.fontSize > 12);
  assert.ok(result.fontSize * 1.35 <= 42 + 0.001);
  assert.ok((result.fontSize + 0.5) * 1.35 > 42);
});

test("maximize mode respects both wrapping and height limits", () => {
  const result = fitRelationshipLabel({
    value: "a longer relationship label for study",
    maximumWidth: 120,
    maximumHeight: 54,
    preferredFontSize: 16,
    maximumLines: 2,
    lineHeight: 1.3,
    maximize: true,
    measureText,
  });

  assert.equal(result.overflowed, false);
  assert.ok(result.lines.length <= 2);
  assert.ok(result.lines.length * result.fontSize * 1.3 <= 54 + 0.001);
  result.lines.forEach((line) => {
    assert.ok(measureText(line, result.fontSize) <= 120 + 0.001);
  });
});

test("preferred-size mode remains unchanged when maximize is disabled", () => {
  const result = fitRelationshipLabel({
    value: "Earth",
    maximumWidth: 180,
    maximumHeight: 42,
    preferredFontSize: 12,
    maximumLines: 1,
    maximize: false,
    measureText,
  });

  assert.equal(result.overflowed, false);
  assert.equal(result.fontSize, 12);
});
