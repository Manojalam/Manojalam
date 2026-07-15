import assert from "node:assert/strict";
import test from "node:test";
import {
  CHART_NODE_MAX_SIZE,
  RELATIONSHIP_DIAGRAM_MIN_WIDTH,
  resolveChartNodeResize,
  SUNBURST_MIN_SIZE,
} from "./chart-sizing";

test("relationship diagrams resize width and height independently", () => {
  const result = resolveChartNodeResize("relationshipDiagram", {
    width: 913.4,
    height: 577.6,
  });

  assert.deepEqual(result, {
    size: { width: 913, height: 578 },
    dataPatch: {
      autoSizeMode: "fixed",
      userSize: { width: 913, height: 578 },
    },
  });
});

test("relationship diagram dimensions are clamped to usable bounds", () => {
  const result = resolveChartNodeResize("relationshipDiagram", {
    width: 120,
    height: 9000,
  });

  assert.deepEqual(result?.size, {
    width: RELATIONSHIP_DIAGRAM_MIN_WIDTH,
    height: CHART_NODE_MAX_SIZE,
  });
});

test("sunburst resizing remains square and updates chart rendering data", () => {
  const result = resolveChartNodeResize("sunburst", {
    width: 812,
    height: 940,
  });

  assert.deepEqual(result, {
    size: { width: 940, height: 940 },
    dataPatch: {
      chartSize: 940,
      chartSizeManual: true,
    },
  });
});

test("sunburst sizing clamps invalid and oversized requests", () => {
  assert.deepEqual(
    resolveChartNodeResize("sunburst", { width: Number.NaN, height: Number.NaN })?.size,
    { width: SUNBURST_MIN_SIZE, height: SUNBURST_MIN_SIZE }
  );
  assert.deepEqual(
    resolveChartNodeResize("sunburst", { width: 5000, height: 6000 })?.size,
    { width: CHART_NODE_MAX_SIZE, height: CHART_NODE_MAX_SIZE }
  );
});

test("non-chart nodes are not handled by chart sizing", () => {
  assert.equal(resolveChartNodeResize("shape", { width: 800, height: 600 }), null);
});
