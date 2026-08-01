import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLayoutConversionShapeDefault,
  clearLayoutEdgeRouting,
  clearMatrixLayoutOverrides,
  clearLayoutNodeGeometry,
  matrixFrameBelongsToLayoutScope,
  removeStaleGeneratedMatrixFrames,
} from "./layout-conversion";

test("chart conversion applies its shape default once without creating a presentation restriction", () => {
  const source = {
    text: "Category",
    shapeType: "diamond",
    cornerRadiusPercent: 0,
    borderRadius: 12,
    fillColor: "#123456",
  };

  for (const mode of ["horizontal", "vertical", "list", "topDown", "linear", "matrix"] as const) {
    const converted = applyLayoutConversionShapeDefault(source, "shape", mode);
    assert.deepEqual(converted, {
      text: "Category",
      shapeType: "rounded",
      cornerRadiusPercent: 40,
      fillColor: "#123456",
    });
  }

  assert.equal(
    applyLayoutConversionShapeDefault(source, "sticky", "list"),
    source
  );
});

test("chart conversion keeps hierarchy and authored content but drops source geometry", () => {
  const source = {
    text: "Child",
    parentId: "root",
    childOrder: ["leaf"],
    collapsed: true,
    fillColor: "#123456",
    layoutColorScheme: "serene",
    layoutMode: "matrix",
    layoutFoldCount: 4,
    layoutFoldBreakAfter: ["leaf"],
    layoutWrapAfter: 3,
    layoutSizeOverride: { mode: "matrix", width: 500, height: 90 },
    listManualOverride: true,
    listDensity: "compact",
    listFoldRootMode: "divided",
    treeManualOverride: true,
    matrixOuterBorderVisible: false,
    matrixDensity: "presentation",
    matrixDensityUserSet: true,
    matrixCompositionMode: "oriented",
    matrixGridVisible: false,
    matrixOrientation: "vertical",
    matrixChildFlow: "row",
    matrixPackCompactGroups: true,
    matrixIncompleteRowMode: "empty",
    matrixEmptySlots: [{ x: 10, y: 20, width: 30, height: 40 }],
    matrixFillCellLabels: true,
    matrixSiblingGap: 24,
    matrixWidthOverride: 500,
    matrixHeightOverride: 90,
    matrixTableWidthOverride: 900,
    matrixTableHeightOverride: 700,
    matrixTableSizeLocked: true,
    matrixIntrinsicSize: { width: 480, height: 72 },
    matrixCell: true,
    matrixCellRole: "cell",
    matrixRootId: "root",
    matrixColumn: 2,
    matrixColumnWidth: 500,
    matrixRowStart: 3,
    matrixRowSpan: 2,
    radialWeight: 2,
    radialCenterRatio: 30,
    radialRingWidths: [1, 2],
    radialTextRotation: 45,
  };

  const converted = clearLayoutNodeGeometry(source);

  assert.deepEqual(converted, {
    text: "Child",
    parentId: "root",
    childOrder: ["leaf"],
    collapsed: true,
    fillColor: "#123456",
    layoutColorScheme: "serene",
  });
  assert.equal(source.layoutFoldCount, 4);
});

test("Matrix reset clears branch and root layout overrides but keeps authored presentation", () => {
  const source = {
    text: "Root",
    fillColor: "#123456",
    layoutColorScheme: "serene",
    layoutMode: "matrix",
    layoutFoldCount: 4,
    layoutFoldBreakAfter: ["leaf"],
    layoutWrapAfter: 3,
    matrixDensity: "presentation",
    matrixDensityUserSet: true,
    matrixOuterBorderVisible: false,
    matrixGridVisible: false,
    matrixOrientation: "vertical",
    matrixChildFlow: "row",
    matrixPackCompactGroups: true,
    matrixIncompleteRowMode: "empty",
    matrixFillCellLabels: true,
    matrixSiblingGap: 24,
    matrixWidthOverride: 500,
    matrixHeightOverride: 90,
    matrixTableWidthOverride: 900,
    matrixTableHeightOverride: 700,
    matrixTableSizeLocked: true,
    matrixIntrinsicSize: { width: 480, height: 72 },
    matrixCell: true,
    matrixRootId: "root",
  };

  assert.deepEqual(clearMatrixLayoutOverrides(source, true), {
    text: "Root",
    fillColor: "#123456",
    layoutColorScheme: "serene",
    layoutMode: "matrix",
    matrixIntrinsicSize: { width: 480, height: 72 },
    matrixCell: true,
    matrixRootId: "root",
  });
  assert.equal(source.matrixTableSizeLocked, true);
});

test("Matrix reset only removes root settings from the root and preserves automatic density", () => {
  const automaticRoot = {
    matrixDensity: "comfortable",
    matrixCompositionMode: "oriented",
    matrixOuterBorderVisible: false,
    matrixGridVisible: false,
    matrixPackCompactGroups: true,
  };
  const branch = {
    matrixDensity: "comfortable",
    matrixOuterBorderVisible: false,
    matrixGridVisible: false,
    matrixPackCompactGroups: true,
    matrixOrientation: "vertical",
    matrixWidthOverride: 420,
  };

  assert.deepEqual(clearMatrixLayoutOverrides(automaticRoot, true), {
    matrixDensity: "comfortable",
  });
  assert.deepEqual(clearMatrixLayoutOverrides(branch), {
    matrixDensity: "comfortable",
    matrixOuterBorderVisible: false,
    matrixGridVisible: false,
    matrixPackCompactGroups: true,
  });
  const automaticPresentation = {
    matrixDensity: "comfortable",
    matrixOuterBorderVisible: true,
    matrixGridVisible: true,
  };
  assert.equal(clearMatrixLayoutOverrides(automaticPresentation, true), automaticPresentation);
});

test("chart conversion keeps edge labels and style but drops source routing", () => {
  const source = {
    label: "because",
    color: "#334455",
    width: 3,
    pathStyle: "dashed",
    layoutMode: "horizontal",
    curveStyle: "step",
    manualRoute: true,
    preserveHandles: true,
    waypoints: [{ x: 100, y: 200 }],
    waypointOrigin: "bend",
    labelPosition: 0.8,
    labelOffset: { x: 12, y: -8 },
    toolbarOffset: { x: 20, y: 10 },
    junctionPreservedWaypoints: true,
    junctionUserWaypoints: [{ x: 80, y: 160 }],
  };

  const converted = clearLayoutEdgeRouting(source);

  assert.deepEqual(converted, {
    label: "because",
    color: "#334455",
    width: 3,
    pathStyle: "dashed",
  });
  assert.equal(source.manualRoute, true);
});

test("chart conversion removes matrix frames for the root and nested roots only", () => {
  const scopeIds = new Set(["root", "branch", "leaf"]);

  assert.equal(matrixFrameBelongsToLayoutScope("root", "root", scopeIds), true);
  assert.equal(matrixFrameBelongsToLayoutScope("branch", "root", scopeIds), true);
  assert.equal(matrixFrameBelongsToLayoutScope("other-root", "root", scopeIds), false);
});

test("persisted boards keep active matrix and authored frames but remove stale generated frames", () => {
  const nodes = [
    { id: "matrix", type: "shape", data: { layoutMode: "matrix" } },
    { id: "tree", type: "shape", data: { layoutMode: "vertical" } },
    { id: "active-frame", type: "frame", data: { matrixFrameFor: "matrix" } },
    { id: "stale-frame", type: "frame", data: { matrixFrameFor: "tree" } },
    { id: "authored-frame", type: "frame", data: { title: "Notes" } },
  ];

  assert.deepEqual(
    removeStaleGeneratedMatrixFrames(nodes).map((node) => node.id),
    ["matrix", "tree", "active-frame", "authored-frame"]
  );
});
