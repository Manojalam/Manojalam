import assert from "node:assert/strict";
import test from "node:test";

import { matrixSectionDownloadFilename } from "./matrix-section-export";

test("creates ordered and filesystem-safe Matrix section filenames", () => {
  assert.equal(
    matrixSectionDownloadFilename(
      "Sandhi chart.png",
      { index: 1, label: "Second / branch: vowels?" },
      3,
      "png"
    ),
    "Sandhi-chart-02-Second-branch-vowels.png"
  );
});
