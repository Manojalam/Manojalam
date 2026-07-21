import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRect, nodePositionFromTopLeft, resizeAroundAnchor } from "./node-geometry";
import {
  effectiveCornerRadius,
  diamondTextLabelBox,
  fitShapeToContent,
  fitSingleUnbrokenWord,
  MAX_AUTOFIT_NODE_HEIGHT,
  MAX_AUTOFIT_NODE_WIDTH,
  MAX_FREEFORM_AUTOFIT_NODE_HEIGHT,
  MAX_FREEFORM_AUTOFIT_NODE_WIDTH,
  maximumFittedTextFontSize,
  nodeContentPadding,
  shapeLabelBox,
  shapeTextFlowLayout,
  shapeTextContentSize,
  shapeTextContentWidth,
  shouldRenderShapeTextFlow,
  shouldUseShapeTextFlow,
} from "./shape-fitting";
import { adaptiveGridMultiplier, renderedGridGap } from "./grid-density";
import {
  computeAutoSize,
  fittedContentScale,
} from "./node-sizing";
import { getFittedTextPresentation } from "../style-utils";

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

test("every editable content node keeps only a thin inset inside its safe geometry", () => {
  for (const nodeType of ["shape", "sticky", "text", "mindmap"]) {
    assert.deepEqual(nodeContentPadding(nodeType), { width: 8, height: 8 });
    assert.deepEqual(
      shapeTextContentSize("rectangle", { width: 180, height: 80 }, nodeType),
      { width: 172, height: 72 }
    );
  }
});

test("diamond fitting uses the full safe interior with compact padding", () => {
  const fitted = fitShapeToContent("diamond", { width: 200, height: 80 }, { nodeType: "shape" });
  const interior = shapeTextContentSize("diamond", fitted, "shape", {
    contentSize: { width: 200, naturalWidth: 200, height: 80 },
  });

  // 200x80 content, 8px total padding per axis, and 2px measurement safety
  // requires a 210x90 padded box. A square diamond fits it in 210 + 90px.
  assert.deepEqual(fitted, { width: 300, height: 300 });
  assert.ok(interior.width >= 200);
  assert.ok(interior.height >= 80);
});

test("diamond measurements cannot collapse the editor to one character", () => {
  const singleLineInterior = shapeTextContentSize("diamond", { width: 126, height: 126 }, "shape", {
    contentSize: {
      width: 8,
      naturalWidth: 180,
      height: 22,
      lineCount: 1,
    },
  });
  const wrappedInterior = shapeTextContentSize("diamond", { width: 126, height: 126 }, "shape", {
    contentSize: {
      width: 8,
      naturalWidth: 180,
      height: 220,
      lineCount: 12,
    },
  });

  assert.ok(singleLineInterior.width >= 92);
  assert.ok(wrappedInterior.width >= 48);
  assert.ok(wrappedInterior.height >= 60);
  assert.ok(shapeTextContentWidth("diamond", 126) >= 55);
});

test("diamond text width does not shrink because of previous soft wrapping", () => {
  const wrappedMeasurement = {
    width: 48,
    naturalWidth: 100,
    height: 72,
    naturalHeight: 20,
    lineCount: 4,
    lineHeight: 18,
  };
  const feedbackInterior = shapeTextContentSize("diamond", { width: 126, height: 126 }, "shape", {
    contentSize: { ...wrappedMeasurement, naturalHeight: undefined },
  });
  const correctedInterior = shapeTextContentSize("diamond", { width: 126, height: 126 }, "shape", {
    contentSize: wrappedMeasurement,
  });

  assert.ok(correctedInterior.width >= 90);
  assert.ok(correctedInterior.width > feedbackInterior.width + 20);
  assert.ok(correctedInterior.height < feedbackInterior.height);
});

test("shape text flow uses the full silhouette instead of one inscribed rectangle", () => {
  const rendered = { width: 360, height: 240 };
  const shapeTypes = [
    "rectangle", "rounded", "capsule", "circle", "ellipse", "diamond",
    "star", "flower", "triangle", "arrow", "callout", "offPageConnector",
    "parallelogram", "trapezoid", "hexagon", "document", "database",
    "predefinedProcess", "delay", "cloud", "leaf",
  ];

  for (const shapeType of shapeTypes) {
    const flow = shapeTextFlowLayout(shapeType, rendered, {
      cornerRadius: shapeType === "rounded" ? 36 : undefined,
      petalCount: 8,
    });
    assert.deepEqual(flow.box, { x: 4, y: 4, width: 352, height: 232 }, `${shapeType} full inset box`);
    assert.ok(flow.areaRatio >= 0.08 && flow.areaRatio <= 1, `${shapeType} finite area`);
    assert.equal(flow.capacity.height, flow.box.height, `${shapeType} full height`);
    assert.ok(flow.capacity.width > 0 && flow.capacity.width <= flow.box.width, `${shapeType} capacity`);
    assert.match(flow.leftExclusion, /^polygon\(/, `${shapeType} left contour`);
    assert.match(flow.rightExclusion, /^polygon\(/, `${shapeType} right contour`);
  }

  const compactDiamond = shapeLabelBox("diamond", rendered, "shape", {
    contentSize: { width: 220, naturalWidth: 360, height: 72, naturalHeight: 24, lineCount: 3 },
  });
  const diamondFlow = shapeTextFlowLayout("diamond", rendered);
  assert.ok(diamondFlow.box.width > compactDiamond.width);
  assert.ok(diamondFlow.box.height > compactDiamond.height);
  assert.ok(diamondFlow.capacity.width * diamondFlow.capacity.height > compactDiamond.width * compactDiamond.height);
  assert.ok(diamondFlow.areaRatio > 0.45 && diamondFlow.areaRatio < 0.55);
});

test("diamond labels use a stable inscribed rectangle", () => {
  const box = diamondTextLabelBox({ width: 250, height: 250 });
  assert.deepEqual(box, { x: 66.5, y: 66.5, width: 117, height: 117 });
  assert.ok(box.x + box.width / 2 <= 125);
  assert.ok(box.y + box.height / 2 <= 125);
  assert.ok(box.width / 250 + box.height / 250 <= 1);
});

test("dense labels use contour flow globally while editing stays caret-safe", () => {
  const rendered = { width: 240, height: 180 };
  const denseMeasurement = { width: 120, naturalWidth: 320, height: 72, lineCount: 3 };
  const flowShapes = [
    "rounded", "capsule", "circle", "ellipse", "diamond", "star", "flower",
    "triangle", "arrow", "callout", "offPageConnector", "parallelogram",
    "trapezoid", "hexagon", "document", "database", "predefinedProcess",
    "delay", "cloud", "leaf",
  ];
  for (const shapeType of flowShapes) {
    assert.equal(
      shouldUseShapeTextFlow(shapeType, rendered, denseMeasurement, "three words here"),
      true,
      `${shapeType} dense flow`
    );
    assert.equal(
      shouldRenderShapeTextFlow(shapeType, rendered, denseMeasurement, true, "three words here"),
      false,
      `${shapeType} editing flow`
    );
  }
  assert.equal(shouldUseShapeTextFlow("rectangle", rendered, denseMeasurement, "three words here"), false);
});

test("authored phrases choose contour flow before the first measurement arrives", () => {
  const rendered = { width: 240, height: 180 };
  assert.equal(shouldUseShapeTextFlow("diamond", rendered, undefined, "अत् + रूप"), true);
  assert.equal(shouldRenderShapeTextFlow("diamond", rendered, undefined, false, "अत् + रूप"), true);
  assert.equal(shouldUseShapeTextFlow("diamond", rendered, undefined, "एकपदम्"), false);
});

test("maximum text fitting fills the corrected diamond interior", () => {
  const interior = shapeTextContentSize("diamond", { width: 126, height: 126 }, "shape", {
    contentSize: { width: 70, naturalWidth: 70, height: 19, lineCount: 1 },
  });
  const presentation = getFittedTextPresentation(
    {
      text: "Decision?",
      fontSize: 14,
      maximizeText: true,
      intrinsicContentSize: { width: 70, naturalWidth: 70, height: 19, lineCount: 1 },
    },
    interior.width,
    14,
    { availableHeight: interior.height, constrain: true }
  );

  assert.ok(presentation.fontSize > 14);
  assert.ok(presentation.scale > 1);
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

test("maximum text fitting grows short labels to the safe width or height limit", () => {
  const fontSize = maximumFittedTextFontSize(
    "Earth",
    { width: 180, height: 50 },
    { preferredFontSize: 14, maximumFontSize: 96 }
  );

  assert.ok(fontSize > 14);
  assert.ok(fontSize * 1.38 <= 50 + 0.001);
  assert.ok((fontSize + 0.25) * 1.38 > 50 || "Earth".length * (fontSize + 0.25) * 0.56 > 180);
});

test("maximum text fitting keeps dense labels inside shape-aware interiors", () => {
  const nodeSize = { width: 240, height: 240 };
  const rectangleInterior = shapeTextContentSize("rectangle", nodeSize, "shape");
  const circleInterior = shapeTextContentSize("circle", nodeSize, "shape");
  const label = "a long study label with several important terms to remember";
  const rectangleFont = maximumFittedTextFontSize(label, rectangleInterior, { preferredFontSize: 14 });
  const circleFont = maximumFittedTextFontSize(label, circleInterior, { preferredFontSize: 14 });

  assert.ok(rectangleFont >= 8 && rectangleFont <= 96);
  assert.ok(circleFont >= 8 && circleFont <= rectangleFont);
  assert.ok(circleInterior.width < rectangleInterior.width);
  assert.ok(circleInterior.height < rectangleInterior.height);
});

test("whole-node maximum fitting is opt-in and preserves the authored font size", () => {
  const ordinary = getFittedTextPresentation(
    { text: "Earth", fontSize: 14 },
    180,
    14,
    { availableHeight: 50, constrain: true }
  );
  const maximized = getFittedTextPresentation(
    { text: "Earth", fontSize: 14, maximizeText: true },
    180,
    14,
    { availableHeight: 50, constrain: true }
  );

  assert.equal(ordinary.authoredFontSize, 14);
  assert.equal(ordinary.scale, 1);
  assert.equal(maximized.authoredFontSize, 14);
  assert.ok(maximized.fontSize > 14);
  assert.ok(maximized.scale > 1);
});

test("maximum fitting does not enlarge an overflowing dense measurement", () => {
  const available = { width: 180, height: 50 };
  const data = {
    text: "Earth",
    fontSize: 14,
    intrinsicContentSize: {
      width: 8,
      naturalWidth: 70,
      height: 400,
      lineCount: 20,
    },
  };
  const ordinary = getFittedTextPresentation(
    data,
    available.width,
    14,
    { availableHeight: available.height, constrain: true }
  );
  const maximized = getFittedTextPresentation(
    {
      ...data,
      maximizeText: true,
    },
    available.width,
    14,
    { availableHeight: available.height, constrain: true }
  );

  assert.equal(maximized.scale, ordinary.scale);
});

test("fill available space never shrinks the normal rendered fit", () => {
  const data = {
    text: [
      "अथ योगानुशासनम्",
      "योगश्चित्तवृत्तिनिरोधः",
      "तदा द्रष्टुः स्वरूपेऽवस्थानम्",
      "वृत्तिसारूप्यमितरत्र",
      "अभ्यासवैराग्याभ्यां तन्निरोधः",
    ].join("\n"),
    fontSize: 33,
    autoSizeMode: "fixed",
    intrinsicContentSize: {
      width: 260,
      naturalWidth: 430,
      height: 260,
      lineCount: 8,
      lineHeight: 45,
    },
  };
  const options = { availableHeight: 120, constrain: true };
  const ordinary = getFittedTextPresentation(data, 260, 14, options);
  const maximized = getFittedTextPresentation({ ...data, maximizeText: true }, 260, 14, options);

  assert.ok(ordinary.scale < 1);
  assert.ok(maximized.scale >= ordinary.scale);
  assert.ok(maximized.fontSize >= ordinary.fontSize);
});

test("fill available space maximizes the actual compact rich-text measurement", () => {
  const available = { width: 72, height: 28 };
  const presentation = getFittedTextPresentation(
    {
      text: "अहन् + सुप ?",
      fontSize: 14,
      maximizeText: true,
      intrinsicContentSize: {
        width: 32,
        naturalWidth: 32,
        height: 9,
        naturalHeight: 9,
        lineCount: 1,
      },
    },
    available.width,
    14,
    { availableHeight: available.height, constrain: true }
  );

  assert.equal(presentation.scale, 2.25);
  assert.equal(32 * presentation.scale, available.width);
});

test("fill available space caps dense rich text at its measured height", () => {
  const available = { width: 180, height: 96 };
  const measurement = {
    width: 150,
    naturalWidth: 420,
    height: 80,
    naturalHeight: 40,
    lineCount: 4,
  };
  const presentation = getFittedTextPresentation(
    {
      text: "a dense label with enough words to wrap across several lines",
      fontSize: 14,
      maximizeText: true,
      intrinsicContentSize: measurement,
    },
    available.width,
    14,
    { availableHeight: available.height, constrain: true }
  );

  assert.equal(presentation.scale, 1.2);
  assert.ok(measurement.height * presentation.scale <= available.height);
  assert.ok(measurement.width * presentation.scale <= available.width);
});

test("fixed-box fitting respects a readable minimum scale", () => {
  const scale = fittedContentScale(
    { width: 800, naturalWidth: 800, height: 500, lineCount: 12 },
    { width: 100, height: 60 },
    8 / 14
  );
  assert.equal(scale, 8 / 14);
});
