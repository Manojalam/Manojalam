import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInk, strokeNear, inkRadius, inkSvg, type InkStroke } from "./handwriting";
const stroke: InkStroke = { id: "s", color: "#123456", width: 2, points: [{ x: -50, y: 30, pressure: 0.5 }, { x: 100, y: 30, pressure: 1 }] };
test("ink normalization preserves world coordinates, colour and pressure", () => {
  const { ink, position } = normalizeInk([stroke]);
  assert.ok(ink.width > 150 && ink.height >= 24);
  assert.deepEqual(ink.strokes[0].points.map(p => ({ ...p, x: p.x + position.x, y: p.y + position.y })), stroke.points);
  assert.equal(ink.strokes[0].color, stroke.color);
  assert.equal(stroke.points[0].x, -50);
});
test("stroke eraser intersects segment interiors and ignores distant strokes", () => {
  assert.equal(strokeNear(stroke, { x: 25, y: 33, pressure: 1 }), true);
  assert.equal(strokeNear(stroke, { x: 25, y: 100, pressure: 1 }), false);
});
test("pen pressure changes width; highlighter stays uniform", () => {
  assert.ok(inkRadius(stroke, stroke.points[0]) < inkRadius(stroke, stroke.points[1]));
  assert.equal(inkRadius({ ...stroke, highlighter: true }, stroke.points[0]), inkRadius({ ...stroke, highlighter: true }, stroke.points[1]));
});

test("vector export retains strokes and cannot inject authored markup", () => {
  const { ink } = normalizeInk([stroke]);
  assert.match(inkSvg(ink), /<line /);
  assert.match(inkSvg(ink), /#123456/);
  assert.ok(!inkSvg({ ...ink, strokes: [{ ...ink.strokes[0], color: '" onload="alert(1)' }] }).includes("onload"));
});
