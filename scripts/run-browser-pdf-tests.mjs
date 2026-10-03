import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(workspace, ".browser-pdf-test");
if (relative(workspace, output) !== ".browser-pdf-test") throw new Error("Unexpected test output path");
const tests = ["browser-pdf", "pdf", "pdf-source-text", "portable-fonts", "dom-renderer", "bounds", "pipeline", "svg-raster-source"];
try {
  const compile = spawnSync(process.execPath, [join(workspace, "node_modules/typescript/bin/tsc"),
    "--outDir", output, "--rootDir", "src/lib", "--module", "commonjs", "--moduleResolution", "node",
    "--target", "ES2022", "--esModuleInterop", "--skipLibCheck",
    ...tests.map(name => `src/lib/export/${name}.test.ts`),
  ], { cwd: workspace, stdio: "inherit" });
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const run = spawnSync(process.execPath, ["--test", ...tests.map(name => join(output, "export", `${name}.test.js`))], { cwd: workspace, stdio: "inherit" });
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
