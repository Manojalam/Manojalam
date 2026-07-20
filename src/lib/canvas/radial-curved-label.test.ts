import assert from "node:assert/strict";
import test from "node:test";

import {
  radialCurvedLabelLayout,
  radialLabelPathIsReversed,
  radialLabelUsesCurvedText,
  radialRichTextRuns,
} from "./radial-curved-label";

test("uses curved text when the section arc is wider than its radial band", () => {
  assert.equal(radialLabelUsesCurvedText({
    innerRadius: 180,
    outerRadius: 260,
    startAngle: -120,
    endAngle: -20,
  }), true);
  assert.equal(radialLabelUsesCurvedText({
    innerRadius: 180,
    outerRadius: 260,
    startAngle: -4,
    endAngle: 4,
  }), false);
});

test("reverses lower-half paths so their text remains upright", () => {
  assert.equal(radialLabelPathIsReversed(-140, -40), false);
  assert.equal(radialLabelPathIsReversed(35, 145), true);
  assert.equal(radialLabelPathIsReversed(-20, 20, 100), true);
});

test("places upper-half lines from the outside inward", () => {
  const layout = radialCurvedLabelLayout({
    centerX: 300,
    centerY: 300,
    innerRadius: 160,
    outerRadius: 260,
    startAngle: -150,
    endAngle: -30,
    fittedLines: ["first", "second", "third"],
    fontSize: 20,
    lineHeight: 1.2,
  });

  assert.equal(layout.reversed, false);
  assert.equal(layout.lines.length, 3);
  assert.ok(layout.lines[0].radius > layout.lines[1].radius);
  assert.ok(layout.lines[1].radius > layout.lines[2].radius);
  layout.lines.forEach((line) => {
    assert.ok(line.radius > 160 && line.radius < 260);
    assert.match(line.path, /^M .* A /);
  });
});

test("places lower-half lines from the inside outward", () => {
  const layout = radialCurvedLabelLayout({
    centerX: 300,
    centerY: 300,
    innerRadius: 160,
    outerRadius: 260,
    startAngle: 30,
    endAngle: 150,
    fittedLines: ["first", "second"],
    fontSize: 18,
    lineHeight: 1.2,
  });

  assert.equal(layout.reversed, true);
  assert.ok(layout.lines[0].radius < layout.lines[1].radius);
  assert.match(layout.lines[0].path, / A .* 0 /);
});

test("keeps a spaced label on one curve when a larger radius can hold it", () => {
  const layout = radialCurvedLabelLayout({
    centerX: 300,
    centerY: 300,
    innerRadius: 100,
    outerRadius: 200,
    startAngle: 60,
    endAngle: 120,
    label: "short continuingtext",
    fittedLines: ["short", "continuingtext"],
    fontSize: 20,
    lineHeight: 1.2,
    measureText: (value) => value.length * 8.2,
  });

  assert.equal(layout.lines.length, 1);
  assert.equal(layout.lines[0].text, "short continuingtext");
  assert.ok(layout.lines[0].radius > 150);
});

test("measures each curved-label candidate only once per layout", () => {
  const measurements = new Map<string, number>();
  const layout = radialCurvedLabelLayout({
    centerX: 300,
    centerY: 300,
    innerRadius: 90,
    outerRadius: 210,
    startAngle: -145,
    endAngle: -35,
    label: "alpha beta gamma delta epsilon zeta eta theta",
    fittedLines: ["alpha beta", "gamma delta", "epsilon zeta", "eta theta"],
    fontSize: 18,
    lineHeight: 1.2,
    measureText: (value) => {
      measurements.set(value, (measurements.get(value) ?? 0) + 1);
      return value.length * 13;
    },
  });

  assert.ok(layout.lines.length > 1);
  assert.ok(measurements.size > 1);
  assert.equal(Math.max(...measurements.values()), 1);
});

test("preserves authored line breaks while fitting curved labels", () => {
  const layout = radialCurvedLabelLayout({
    centerX: 300,
    centerY: 300,
    innerRadius: 100,
    outerRadius: 220,
    startAngle: -150,
    endAngle: -30,
    label: "first line\nsecond line",
    fittedLines: ["first line", "second line"],
    fontSize: 18,
    lineHeight: 1.2,
    measureText: (value) => value.length * 8,
  });

  assert.deepEqual(layout.lines.map((line) => line.text), ["first line", "second line"]);
});

test("places every Devanagari line on its own concentric curve", () => {
  const layout = radialCurvedLabelLayout({
    centerX: 300,
    centerY: 300,
    innerRadius: 110,
    outerRadius: 250,
    startAngle: -155,
    endAngle: -25,
    label: "गुणाः\nद्रव्यम्\nअभावः",
    fittedLines: ["गुणाः", "द्रव्यम्", "अभावः"],
    fontSize: 22,
    lineHeight: 1.28,
    measureText: (value) => Array.from(value).length * 13,
  });

  assert.equal(layout.lines.length, 3);
  assert.deepEqual(layout.lines.map((line) => line.text), ["गुणाः", "द्रव्यम्", "अभावः"]);
  assert.ok(layout.lines[0].radius > layout.lines[1].radius);
  assert.ok(layout.lines[1].radius > layout.lines[2].radius);
  layout.lines.forEach((line) => assert.match(line.path, /^M .* A /));
});

test("maps inline rich-text styles back onto wrapped curved lines", () => {
  const lines = radialRichTextRuns(
    '<p><strong>अक् सवर्णः</strong> <span style="color: #dc2626; font-style: italic">दीर्घः</span></p>',
    ["अक् सवर्णः", "दीर्घः"]
  );

  assert.equal(lines[0].map((run) => run.text).join(""), "अक् सवर्णः");
  assert.equal(lines[0][0].style.fontWeight, "bold");
  assert.equal(lines[1].map((run) => run.text).join(""), "दीर्घः");
  assert.equal(lines[1][0].style.fill, "#dc2626");
  assert.equal(lines[1][0].style.fontStyle, "italic");
});

test("decodes common and numeric HTML entities without using the DOM", () => {
  const lines = radialRichTextRuns("<p>A&nbsp;&amp;&#x20;B</p>", ["A & B"]);
  assert.equal(lines[0].map((run) => run.text).join(""), "A & B");
});
