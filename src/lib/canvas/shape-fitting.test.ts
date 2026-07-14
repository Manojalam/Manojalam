import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRect, nodePositionFromTopLeft, resizeAroundAnchor } from "./node-geometry";
import {
  effectiveCornerRadius,
  fitShapeToContent,
  fitSingleUnbrokenWord,
  MAX_AUTOFIT_NODE_HEIGHT,
  MAX_AUTOFIT_NODE_WIDTH,
  MAX_FREEFORM_AUTOFIT_NODE_HEIGHT,
  MAX_FREEFORM_AUTOFIT_NODE_WIDTH,
  shapeTextContentSize,
  shapeTextContentWidth,
} from "./shape-fitting";
import { adaptiveGridMultiplier, renderedGridGap } from "./grid-density";

test("top-left growth and center conversion use different anchors", () => {
  const rect = createNodeRect("n", 100, 80, 200, 100);
  assert.deepEqual(resizeAroundAnchor(rect, { width: 300, height: 160 }, "top-left"), { x: 100, y: 80 });
  assert.deepEqual(resizeAroundAnchor(rect, { width: 300, height: 160 }, "center"), { x: 50, y: 50 });
});

test("shape fitting gives every supported conversion a safe finite interior", () => {
  const content = { width: 200, height: 80 };
  const rectangle = fitShapeToContent("rectangle", content, { nodeType: "shape" });
  const rounded = fitShapeToContent("rounded", content, { nodeType: "shape" });
  const capsule = fitShapeToContent("capsule", content, { nodeType: "shape" });
  const diamond = fitShapeToContent("diamond", content, { nodeType: "shape" });
  const circle = fitShapeToContent("circle", content, { nodeType: "shape" });
  const ellipse = fitShapeToContent("ellipse", content, { nodeType: "shape" });
  for (const size of [rectangle, rounded, capsule, diamond, circle, ellipse]) {
    assert.ok(Number.isFinite(size.width) && size.width >= 160);
    assert.ok(Number.isFinite(size.height) && size.height >= 56);
  }
  assert.deepEqual(rounded, rectangle);
  assert.ok(capsule.width > rectangle.width);
  assert.ok(diamond.width > rectangle.width);
  assert.ok(diamond.height > rectangle.height);
  assert.equal(circle.width, circle.height);
  assert.ok(ellipse.width > rectangle.width);
  assert.ok(ellipse.height > rectangle.height);
});

test("100 percent radius reaches half the shorter dimension", () => {
  assert.equal(effectiveCornerRadius(100, { width: 300, height: 80 }), 40);
  assert.equal(effectiveCornerRadius(0, { width: 300, height: 80 }), 0);
});

test("adaptive grid density preserves logical multiples", () => {
  assert.equal(adaptiveGridMultiplier(24, 1), 1);
  assert.equal(adaptiveGridMultiplier(24, 0.2), 4);
  assert.equal(renderedGridGap(24, 0.2), 96);
  assert.equal(renderedGridGap(24, 2), 24);
});

test("one unbroken word stays on one line and shrinks to the available width", () => {
  const fitted = fitSingleUnbrokenWord("अतिदीर्घसंस्कृतसमासपदम्", 24, 120);
  const phrase = fitSingleUnbrokenWord("two words", 24, 120);

  assert.equal(fitted.singleWord, true);
  assert.ok(fitted.fontSize > 0 && fitted.fontSize < 24);
  assert.deepEqual(phrase, { singleWord: false, fontSize: 24 });
  assert.ok(shapeTextContentWidth("diamond", 240) < shapeTextContentWidth("rectangle", 240));
});

test("automatic fitting caps growth and exposes each shape's safe text interior", () => {
  const capped = fitShapeToContent("rectangle", { width: 4000, height: 3000 }, {
    nodeType: "shape",
    maxWidth: MAX_AUTOFIT_NODE_WIDTH,
    maxHeight: MAX_AUTOFIT_NODE_HEIGHT,
  });
  const diamondInterior = shapeTextContentSize("diamond", capped, "shape");
  const rectangleInterior = shapeTextContentSize("rectangle", capped, "shape");

  assert.ok(capped.width <= MAX_AUTOFIT_NODE_WIDTH);
  assert.ok(capped.width >= 560);
  assert.equal(capped.height, MAX_AUTOFIT_NODE_HEIGHT);
  assert.ok(diamondInterior.width < rectangleInterior.width);
  assert.ok(diamondInterior.height < rectangleInterior.height);
});

test("automatic caps never shrink a manually enlarged node", () => {
  const fitted = fitShapeToContent("rectangle", { width: 100, height: 50 }, {
    nodeType: "shape",
    currentSize: { width: 820, height: 620 },
    growOnly: true,
    maxWidth: MAX_AUTOFIT_NODE_WIDTH,
    maxHeight: MAX_AUTOFIT_NODE_HEIGHT,
  });
  assert.deepEqual(fitted, { width: 820, height: 620 });
});

test("free-form content can grow beyond the compact-layout cap without moving its top-left anchor", () => {
  const original = createNodeRect("freeform", 120, 85, 220, 120);
  const fitted = fitShapeToContent("rectangle", { width: 1_240, height: 860 }, {
    nodeType: "shape",
    currentSize: { width: original.width, height: original.height },
    growOnly: true,
    maxContentWidth: MAX_FREEFORM_AUTOFIT_NODE_WIDTH,
    maxWidth: MAX_FREEFORM_AUTOFIT_NODE_WIDTH,
    maxHeight: MAX_FREEFORM_AUTOFIT_NODE_HEIGHT,
  });

  assert.ok(fitted.width > MAX_AUTOFIT_NODE_WIDTH);
  assert.ok(fitted.height > MAX_AUTOFIT_NODE_HEIGHT);
  assert.ok(fitted.width <= MAX_FREEFORM_AUTOFIT_NODE_WIDTH);
  assert.ok(fitted.height <= MAX_FREEFORM_AUTOFIT_NODE_HEIGHT);
  assert.deepEqual(resizeAroundAnchor(original, fitted, "top-left"), { x: 120, y: 85 });
});

test("top-left growth remains fixed for center-origin nodes", () => {
  const node = { origin: [0.5, 0.5] as [number, number] };
  const oldTopLeft = { x: 120, y: 85 };
  const nextSize = { width: 640, height: 360 };
  const nextTopLeft = resizeAroundAnchor(
    createNodeRect("center-origin", oldTopLeft.x, oldTopLeft.y, 220, 120),
    nextSize,
    "top-left"
  );
  const nextPosition = nodePositionFromTopLeft(node, nextTopLeft, nextSize);

  assert.deepEqual(nextTopLeft, oldTopLeft);
  assert.deepEqual(nextPosition, { x: 440, y: 265 });
});
