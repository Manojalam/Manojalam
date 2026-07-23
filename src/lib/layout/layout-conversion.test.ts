import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLayoutEdgeRouting,
  clearLayoutNodeGeometry,
} from "./layout-conversion";

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
    treeManualOverride: true,
    matrixDensity: "presentation",
    matrixDensityUserSet: true,
    matrixGridVisible: false,
    matrixOrientation: "vertical",
    matrixWidthOverride: 500,
    matrixHeightOverride: 90,
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
