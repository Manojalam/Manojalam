import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outputDirectory = ".audio-recording-test";
const typeScriptCli = fileURLToPath(
  new URL("../node_modules/typescript/bin/tsc", import.meta.url)
);

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
      "ES2020",
      "--esModuleInterop",
      "--skipLibCheck",
      "src/lib/canvas/audio-recording.ts",
      "src/lib/canvas/audio-recording.test.ts",
    ],
    { stdio: "inherit" }
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);

  const tests = spawnSync(
    process.execPath,
    ["--test", `${outputDirectory}/audio-recording.test.js`],
    { stdio: "inherit" }
  );
  if (tests.status !== 0) process.exit(tests.status ?? 1);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
