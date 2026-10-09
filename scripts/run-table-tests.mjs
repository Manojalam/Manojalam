import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(workspace, ".table-test");
const tests = ["table", "clipboard", "template-clipboard", "selection-text-style"];
if (relative(workspace, output) !== ".table-test") throw new Error("Unexpected test output path");
try {
  const compile = spawnSync(process.execPath, [join(workspace, "node_modules/typescript/bin/tsc"), "--outDir", output, "--rootDir", "src/lib", "--module", "commonjs", "--moduleResolution", "node", "--target", "ES2022", "--esModuleInterop", "--skipLibCheck", ...tests.map(name => `src/lib/canvas/${name}.test.ts`)], { cwd: workspace, stdio: "inherit" });
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else process.exitCode = spawnSync(process.execPath, ["--test", ...tests.map(name => join(output, `canvas/${name}.test.js`))], { cwd: workspace, stdio: "inherit" }).status ?? 1;
} finally { rmSync(output, { recursive: true, force: true }); }
