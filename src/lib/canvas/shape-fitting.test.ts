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
import {
  computeAutoSize,
  fittedContentScale,
} from "./node-sizing";

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

  const circleInterior = shapeTextContentSize("circle", circle, "shape", { contentSize: content });
  const ellipseInterior = shapeTextContentSize("ellipse", ellipse, "shape", { contentSize: content });
  const diamondInterior = shapeTextContentSize("diamond", diamond, "shape", { contentSize: content });
  for (const interior of [circleInterior, ellipseInterior, diamondInterior]) {
    assert.ok(interior.width >= content.width);
    assert.ok(interior.height >= content.height);
  }
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
  assert.ok(capped.width > 480);
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
  const fitted = fitShapeToContent("rectangle", { width: 1_240, height: 1_600 }, {
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

test("smart sizing grows a long line without changing a comfortable short label", () => {
  const short = computeAutoSize({
    mode: "smart",
    currentSize: { width: 220, height: 72 },
    content: { width: 70, naturalWidth: 70, height: 22, lineCount: 1 },
    nodeType: "shape",
    shapeType: "rectangle",
    reason: "input",
  });
  const long = computeAutoSize({
    mode: "smart",
    currentSize: { width: 160, height: 70 },
    content: { width: 108, naturalWidth: 360, height: 24, lineCount: 1 },
    nodeType: "shape",
    shapeType: "rectangle",
    reason: "input",
  });

  assert.deepEqual(short, { width: 220, height: 72, changed: false });
  assert.ok(long.changed);
  assert.ok(long.width > 160 && long.width <= MAX_AUTOFIT_NODE_WIDTH);
});

test("keep-width grows vertically and fixed mode preserves both manual dimensions", () => {
  const keepWidth = computeAutoSize({
    mode: "height-only",
    currentSize: { width: 280, height: 70 },
    content: { width: 220, naturalWidth: 900, height: 210, lineCount: 8 },
    nodeType: "text",
    shapeType: "rectangle",
    reason: "paste",
  });
  const fixed = computeAutoSize({
    mode: "fixed",
    currentSize: { width: 180, height: 90 },
    content: { width: 600, naturalWidth: 900, height: 500, lineCount: 14 },
  });

  assert.equal(keepWidth.width, 280);
  assert.ok(keepWidth.height > 70);
  assert.deepEqual(fixed, { width: 180, height: 90, changed: false });
});

test("smart sizing uses hysteresis while editing and shrinks on explicit fit", () => {
  const activeEdit = computeAutoSize({
    mode: "smart",
    currentSize: { width: 420, height: 120 },
    content: { width: 120, naturalWidth: 120, height: 28, lineCount: 1 },
    nodeType: "shape",
    shapeType: "rectangle",
    reason: "input",
  });
  const explicitFit = computeAutoSize({
    mode: "smart",
    currentSize: { width: 420, height: 120 },
    content: { width: 120, naturalWidth: 120, height: 28, lineCount: 1 },
    nodeType: "shape",
    shapeType: "rectangle",
    reason: "fit",
  });

  assert.deepEqual(activeEdit, { width: 420, height: 120, changed: false });
  assert.ok(explicitFit.changed);
  assert.ok(explicitFit.width < activeEdit.width);
  assert.ok(explicitFit.height < activeEdit.height);
});

test("passive hydration measurements preserve the saved node rectangle", () => {
  const savedSize = { width: 420, height: 180 };
  const muchSmallerContent = computeAutoSize({
    mode: "smart",
    currentSize: savedSize,
    content: { width: 60, naturalWidth: 60, height: 22, lineCount: 1 },
    nodeType: "shape",
    shapeType: "rectangle",
    reason: "layout",
  });
  const overflowingContent = computeAutoSize({
    mode: "smart",
    currentSize: savedSize,
    content: { width: 900, naturalWidth: 1_200, height: 700, lineCount: 20 },
    nodeType: "shape",
    shapeType: "rectangle",
    reason: "layout",
  });

  assert.deepEqual(muchSmallerContent, { ...savedSize, changed: false });
  assert.deepEqual(overflowingContent, { ...savedSize, changed: false });
});

test("fixed-box rich text only scales down and restores authored size when space returns", () => {
  const content = { width: 300, naturalWidth: 300, height: 180, lineCount: 6 };
  const constrained = fittedContentScale(content, { width: 150, height: 90 });
  const roomy = fittedContentScale(content, { width: 500, height: 300 });
  const shortLabel = fittedContentScale(
    { width: 70, naturalWidth: 70, height: 20, lineCount: 1 },
    { width: 210, height: 70 }
  );

  assert.equal(constrained, 0.5);
  assert.equal(roomy, 1);
  assert.equal(shortLabel, 1);
});

test("fixed-box fitting respects a readable minimum scale", () => {
  const scale = fittedContentScale(
    { width: 800, naturalWidth: 800, height: 500, lineCount: 12 },
    { width: 100, height: 60 },
    8 / 14
  );
  assert.equal(scale, 8 / 14);
});
