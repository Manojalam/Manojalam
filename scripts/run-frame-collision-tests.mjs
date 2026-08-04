import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(workspace, ".frame-collision-test");
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const sources = [
  "src/lib/types.ts",
  "src/lib/layout/geometry.ts",
  "src/lib/canvas/frame-collision.ts",
  "src/lib/canvas/layer-order.ts",
  "src/lib/canvas/drag-movement.ts",
  "src/lib/canvas/frame-collision.test.ts",
  "src/lib/canvas/layer-order.test.ts",
  "src/lib/canvas/drag-movement.test.ts",
];

await rm(output, { recursive: true, force: true });
let status = spawnSync(
  process.execPath,
  [
    tsc,
    "--rootDir",
    "src/lib",
    "--outDir",
    output,
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "ES2020",
    "--esModuleInterop",
    "--skipLibCheck",
    ...sources,
  ],
  { cwd: workspace, stdio: "inherit" }
).status ?? 1;

if (status === 0) {
  status = spawnSync(
    process.execPath,
    [
      "--test",
      join(output, "canvas", "frame-collision.test.js"),
      join(output, "canvas", "layer-order.test.js"),
      join(output, "canvas", "drag-movement.test.js"),
    ],
    { cwd: workspace, stdio: "inherit" }
  ).status ?? 1;
}

await rm(output, { recursive: true, force: true });
process.exit(status);
