import assert from "node:assert/strict";
import test from "node:test";

import { hierarchySectionDownloadFilename } from "./hierarchy-section-export";

test("creates ordered and filesystem-safe hierarchy section filenames", () => {
  assert.equal(
    hierarchySectionDownloadFilename(
      "Sandhi chart.png",
      { index: 1, label: "Second / branch: vowels?" },
      3,
      "png"
    ),
    "Sandhi-chart-02-Second-branch-vowels.png"
  );
});
