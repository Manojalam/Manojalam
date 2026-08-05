import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(workspace, ".template-test");
const typeScriptCli = join(workspace, "node_modules", "typescript", "bin", "tsc");

rmSync(outputDirectory, { recursive: true, force: true });

try {
  const compile = spawnSync(
    process.execPath,
    [
      typeScriptCli,
      "--outDir",
      outputDirectory,
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--target",
      "ES2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "src/lib/config.ts",
      "src/lib/types.ts",
      "src/lib/utils.ts",
      "src/lib/text-tools.ts",
      "src/lib/sanskrit/transliterate.ts",
      "src/lib/sanskrit/transliterate.test.ts",
      "src/lib/canvas/shloka-card-editor.ts",
      "src/lib/canvas/shloka-card-editor.test.ts",
      "src/lib/canvas/shloka-study-migration.ts",
      "src/lib/canvas/shloka-study-migration.test.ts",
      "src/lib/canvas/shloka-study-palette.ts",
      "src/lib/canvas/shloka-study-palette.test.ts",
      "src/lib/templates/index.ts",
      "src/lib/templates/persistence.ts",
      "src/lib/templates/index.test.ts",
    ],
    { cwd: workspace, stdio: "inherit" }
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);

  const tests = spawnSync(
    process.execPath,
    [
      "--test",
      join(outputDirectory, "sanskrit", "transliterate.test.js"),
      join(outputDirectory, "canvas", "shloka-card-editor.test.js"),
      join(outputDirectory, "canvas", "shloka-study-migration.test.js"),
      join(outputDirectory, "canvas", "shloka-study-palette.test.js"),
      join(outputDirectory, "templates", "index.test.js"),
    ],
    { cwd: workspace, stdio: "inherit" }
  );
  if (tests.status !== 0) process.exit(tests.status ?? 1);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
