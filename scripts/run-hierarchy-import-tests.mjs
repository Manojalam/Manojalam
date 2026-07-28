import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(workspace, ".hierarchy-import-test");
const tsc = join(workspace, "node_modules", "typescript", "bin", "tsc");
const sources = [
  "src/lib/types.ts",
  "src/lib/config.ts",
  "src/lib/utils.ts",
  "src/lib/import/types.ts",
  "src/lib/import/script.ts",
  "src/lib/import/text.ts",
  "src/lib/import/draft.ts",
  "src/lib/import/raster.ts",
  "src/lib/import/pdf.ts",
  "src/lib/import/board.ts",
  "src/lib/import/hierarchy-import.test.ts",
];

await rm(output, { recursive: true, force: true });
let status = spawnSync(
  process.execPath,
  [
    tsc,
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
    ["--test", join(output, "import", "hierarchy-import.test.js")],
    { cwd: workspace, stdio: "inherit" }
  ).status ?? 1;
}

await rm(output, { recursive: true, force: true });
process.exit(status);
