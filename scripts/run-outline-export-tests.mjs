import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(workspace, ".outline-export-test");
const tsc = join(workspace, "node_modules", "typescript", "bin", "tsc");
const sources = [
  "src/lib/types.ts",
  "src/lib/outline-payload.ts",
  "src/lib/layout/geometry.ts",
  "src/lib/layout/hierarchy.ts",
  "src/lib/export/outline.ts",
  "src/lib/export/outline.test.ts",
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
    "ES2022",
    "--esModuleInterop",
    "--skipLibCheck",
    ...sources,
  ],
  { cwd: workspace, stdio: "inherit" }
).status ?? 1;

if (status === 0) {
  status = spawnSync(
    process.execPath,
    ["--test", join(output, "export", "outline.test.js")],
    { cwd: workspace, stdio: "inherit" }
  ).status ?? 1;
}

await rm(output, { recursive: true, force: true });
process.exit(status);
