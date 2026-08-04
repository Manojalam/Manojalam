import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { getNodeRect } from "../layout/geometry";
import { placeNewChild } from "./child-placement";

test("the first new child shares its parent's centerline after sizing", () => {
  const parent: Node = {
    id: "parent",
    position: { x: 100, y: 200 },
    style: { width: 180, height: 80 },
    data: {},
  };
  const child: Node = {
    id: "child",
    origin: [0.5, 0.5],
    position: { x: 0, y: 0 },
    style: { width: 180, height: 70 },
    data: {},
  };

  const placed = placeNewChild(parent, child, 0);
  const parentRect = getNodeRect(parent);
  const childRect = getNodeRect(placed);

  assert.equal(childRect.left, parentRect.right + 104);
  assert.equal(childRect.centerY, parentRect.centerY);
});

test("additional new children stack below the shared centerline", () => {
  const parent: Node = {
    id: "parent",
    position: { x: 100, y: 200 },
    style: { width: 180, height: 80 },
    data: {},
  };
  const child: Node = {
    id: "child",
    position: { x: 0, y: 0 },
    style: { width: 160, height: 70 },
    data: {},
  };

  const first = getNodeRect(placeNewChild(parent, child, 0));
  const second = getNodeRect(placeNewChild(parent, child, 1));

  assert.equal(second.top - first.top, 98);
});
