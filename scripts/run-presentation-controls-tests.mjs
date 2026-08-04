import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(workspace, ".presentation-controls-test");
const typeScriptCli = join(workspace, "node_modules", "typescript", "bin", "tsc");

rmSync(outputDirectory, { recursive: true, force: true });

try {
  const compile = spawnSync(
    process.execPath,
    [
      typeScriptCli,
      "--rootDir",
      "src/lib",
      "--outDir",
      outputDirectory,
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--target",
      "ES2020",
      "--esModuleInterop",
      "--skipLibCheck",
      "src/lib/layout/geometry.ts",
      "src/lib/layout/hierarchy.ts",
      "src/lib/canvas/frame-collision.ts",
      "src/lib/canvas/presentation.ts",
      "src/lib/canvas/presentation.test.ts",
    ],
    { cwd: workspace, stdio: "inherit" }
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);

  const tests = spawnSync(
    process.execPath,
    ["--test", join(outputDirectory, "canvas", "presentation.test.js")],
    { cwd: workspace, stdio: "inherit" }
  );
  if (tests.status !== 0) process.exit(tests.status ?? 1);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
