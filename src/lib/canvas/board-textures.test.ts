import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_TEXTURE_PRESETS,
  boardTextureStyle,
  normalizeBoardTexture,
} from "./board-textures";

test("normalizes persisted canvas texture values", () => {
  assert.equal(normalizeBoardTexture("paper"), "paper");
  assert.equal(normalizeBoardTexture("linen"), "linen");
  assert.equal(normalizeBoardTexture("grain"), "grain");
  assert.equal(normalizeBoardTexture("unknown"), "none");
  assert.equal(normalizeBoardTexture(undefined), "none");
});

test("offers solid and subtle CSS-only texture presets", () => {
  assert.deepEqual(
    BOARD_TEXTURE_PRESETS.map(({ id }) => id),
    ["none", "paper", "linen", "grain"]
  );
  assert.deepEqual(boardTextureStyle("none"), {});
  for (const texture of ["paper", "linen", "grain"] as const) {
    const style = boardTextureStyle(texture);
    assert.match(style.backgroundImage ?? "", /gradient/);
    assert.ok(style.backgroundSize);
  }
});
