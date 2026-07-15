import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRadialLabelRotation,
  resolveChartAwareCenterLabelRotation,
  resolveChartAwareSectorLabelRotation,
  resolveRadialLabelRotation,
} from "./radial-label-rotation";

test("manual radial label rotation remains relative to automatic orientation", () => {
  assert.equal(resolveRadialLabelRotation(135, 25), 160);
  assert.equal(resolveRadialLabelRotation(-40, -30), -70);
});

test("radial label rotation normalizes to the inspector range", () => {
  assert.equal(normalizeRadialLabelRotation(540), 180);
  assert.equal(normalizeRadialLabelRotation(-540), -180);
  assert.equal(normalizeRadialLabelRotation(270), -90);
  assert.equal(normalizeRadialLabelRotation(Number.NaN), 0);
});

test("sector labels flip based on their rotated screen orientation", () => {
  assert.equal(resolveChartAwareSectorLabelRotation(80, 0, 0), 80);
  assert.equal(resolveChartAwareSectorLabelRotation(80, 20, 0), -100);
  assert.equal(resolveChartAwareSectorLabelRotation(100, -20, 0), 100);
  assert.equal(resolveChartAwareSectorLabelRotation(-80, -20, 0), 100);
});

test("manual sector angles remain offsets after whole-chart rotation", () => {
  const chartRotation = -20;
  const localRotation = resolveChartAwareSectorLabelRotation(-80, chartRotation, 15);
  assert.equal(localRotation, 115);
  assert.equal(normalizeRadialLabelRotation(localRotation + chartRotation), 95);
});

test("automatic orientation flips only beyond the upright boundary", () => {
  assert.equal(resolveChartAwareSectorLabelRotation(90, 0, 0), 90);
  assert.equal(resolveChartAwareSectorLabelRotation(90.001, 0, 0), -89.999);
  assert.equal(resolveChartAwareSectorLabelRotation(-90, 0, 0), -90);
  assert.equal(resolveChartAwareSectorLabelRotation(-90.001, 0, 0), 89.999);
});

test("center labels counter-rotate to preserve their authored screen angle", () => {
  assert.equal(resolveChartAwareCenterLabelRotation(45, 0), -45);
  assert.equal(resolveChartAwareCenterLabelRotation(45, 30), -15);
  assert.equal(resolveChartAwareCenterLabelRotation(-120, -25), 95);
});
