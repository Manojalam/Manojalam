import assert from "node:assert/strict";
import test from "node:test";
import type { Node } from "@xyflow/react";
import { normalizePersistedNode } from "./node-persistence";

function node(overrides: Partial<Node> = {}): Node {
  return {
    id: "node-1",
    type: "shape",
    position: { x: 120, y: 85 },
    origin: [0.5, 0.5],
    data: {},
    ...overrides,
  };
}

test("authored style wins over stale React Flow measurements", () => {
  const saved = normalizePersistedNode(node({
    style: { width: 420, height: 180 },
    width: 160,
    height: 70,
    measured: { width: 160, height: 70 },
    selected: true,
    dragging: true,
  }));

  assert.deepEqual(saved.style, { width: 420, height: 180 });
  assert.deepEqual(saved.position, { x: 120, y: 85 });
  assert.deepEqual(saved.origin, [0.5, 0.5]);
  assert.equal(saved.width, undefined);
  assert.equal(saved.height, undefined);
  assert.equal(saved.measured, undefined);
  assert.equal(saved.selected, undefined);
  assert.equal(saved.dragging, undefined);
});

test("fixed user size repairs a previously cleared authored dimension", () => {
  const saved = normalizePersistedNode(node({
    data: { autoSizeMode: "fixed", userSize: { width: 360, height: 220 } },
    style: { width: 360 },
    measured: { width: 360, height: 84 },
    width: 360,
    height: 84,
  }));

  assert.deepEqual(saved.style, { width: 360, height: 220 });
});

test("measured-only smart height remains automatic", () => {
  const saved = normalizePersistedNode(node({
    data: { autoSizeMode: "smart" },
    style: { width: 240 },
    measured: { width: 240, height: 136 },
  }));

  assert.deepEqual(saved.style, { width: 240 });
});

test("explicit resizer dimensions are promoted even when measured is present", () => {
  const saved = normalizePersistedNode(node({
    measured: { width: 340, height: 190 },
    width: 340,
    height: 190,
  }));

  assert.deepEqual(saved.style, { width: 340, height: 190 });
});

test("legacy explicit dimensions are promoted when no runtime measurement exists", () => {
  const saved = normalizePersistedNode(node({ width: 300, height: 140 }));
  assert.deepEqual(saved.style, { width: 300, height: 140 });
});

test("layout presentation remains canonical and normalization is idempotent", () => {
  const source = node({
    data: {
      autoSizeMode: "fixed",
      userSize: { width: 300, height: 140 },
      layoutSizeOverride: { mode: "matrix", width: 520, height: 260 },
    },
  });
  const once = normalizePersistedNode(source);
  const twice = normalizePersistedNode(once);

  assert.deepEqual(once.style, { width: 520, height: 260 });
  assert.deepEqual(twice, once);
});
