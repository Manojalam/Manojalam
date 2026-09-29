import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(workspace, ".text-editing-test");
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const sources = [
  "src/lib/canvas/text-editing-session.ts",
  "src/lib/canvas/text-editing-session.test.ts",
  "src/lib/canvas/paragraph-layout.test.ts",
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
    ["--test", join(output, "canvas", "text-editing-session.test.js"), join(output, "canvas", "paragraph-layout.test.js")],
    { cwd: workspace, stdio: "inherit" }
  ).status ?? 1;
}

await rm(output, { recursive: true, force: true });
process.exit(status);
