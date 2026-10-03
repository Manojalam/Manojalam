import { spawnSync } from "node:child_process";

// Exercise the shipped Linux binary, not a developer's locally installed fonts.
if (process.env.VERCEL) {
  const result = spawnSync(process.execPath, ["scripts/run-direct-pdf-smoke.mjs"], {
    stdio: "inherit", env: { ...process.env, PDF_CHROMIUM_EXECUTABLE_PATH: "" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
