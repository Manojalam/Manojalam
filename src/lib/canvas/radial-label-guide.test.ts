import assert from "node:assert/strict";
import test from "node:test";

import { radialLabelGuideGeometry } from "./radial-label-guide";

test("insets a label guide while retaining the section's radial geometry", () => {
  const guide = radialLabelGuideGeometry({
    innerRadius: 100,
    outerRadius: 180,
    startAngle: 20,
    endAngle: 80,
  });

  assert.equal(guide.innerRadius, 105);
  assert.equal(guide.outerRadius, 175);
  assert.ok(guide.startAngle > 20);
  assert.ok(guide.endAngle < 80);
  assert.ok(Math.abs((guide.startAngle - 20) - (80 - guide.endAngle)) < 0.000001);
});

test("keeps narrow sections open instead of collapsing their guide", () => {
  const guide = radialLabelGuideGeometry({
    innerRadius: 220,
    outerRadius: 250,
    startAngle: 10,
    endAngle: 12.5,
  }, 8);

  assert.ok(guide.endAngle > guide.startAngle);
  assert.ok(guide.endAngle - guide.startAngle >= 2.5 * 0.64);
  assert.ok(guide.outerRadius > guide.innerRadius);
});

test("caps the radial inset for shallow rings", () => {
  const guide = radialLabelGuideGeometry({
    innerRadius: 100,
    outerRadius: 110,
    startAngle: 0,
    endAngle: 40,
  }, 20);

  assert.equal(guide.innerRadius, 102.2);
  assert.equal(guide.outerRadius, 107.8);
});
