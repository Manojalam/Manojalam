import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(workspace, ".powerpoint-smoke-test");
const outputFile = join(outputDirectory, "editable-teaching-smoke-test.pptx");
const typeScriptCli = join(workspace, "node_modules", "typescript", "bin", "tsc");

await rm(outputDirectory, { recursive: true, force: true });

try {
  const compile = spawnSync(
    process.execPath,
    [typeScriptCli, "--project", "scripts/tsconfig.powerpoint-smoke.json"],
    { cwd: workspace, stdio: "inherit" }
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);

  // TypeScript preserves the app's @/ aliases in CommonJS output. Resolve
  // those aliases against the isolated compiled fixture for this smoke test.
  const require = createRequire(import.meta.url);
  const Module = require("node:module");
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolvePowerPointAlias(request, parent, isMain, options) {
    const mapped = typeof request === "string" && request.startsWith("@/")
      ? join(outputDirectory, request.slice(2))
      : request;
    return originalResolveFilename.call(this, mapped, parent, isMain, options);
  };

  const { downloadEditablePowerPoint } = require(join(outputDirectory, "lib", "export", "powerpoint.js"));
  const root = {
    id: "root",
    type: "shape",
    position: { x: 20, y: 100 },
    width: 220,
    height: 90,
    data: { shapeType: "rounded", text: "Editable root", fillColor: "#dbeafe" },
  };
  const child = {
    id: "child",
    type: "shape",
    position: { x: 340, y: 100 },
    width: 220,
    height: 90,
    data: { parentId: "root", shapeType: "diamond", text: "Editable child", fillColor: "#dcfce7" },
  };
  const radial = {
    id: "radial",
    type: "sunburst",
    position: { x: 650, y: 20 },
    width: 430,
    height: 330,
    data: { rootId: "root", sunburstFor: "root", title: "Editable radial chart" },
  };
  const edge = {
    id: "root-child",
    source: "root",
    target: "child",
    data: { label: "Editable connector label", arrowEnd: true },
  };
  await downloadEditablePowerPoint({
    boardTitle: "Editable teaching smoke test",
    nodes: [root, child, radial],
    edges: [edge],
    relationships: [],
    stops: [{
      id: "overview",
      kind: "overview",
      title: "Editable board overview",
      nodeIds: ["root", "child", "radial"],
    }],
    filename: outputFile,
  });

  const archive = await JSZip.loadAsync(await readFile(outputFile));
  const slidePaths = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  assert.equal(slidePaths.length, 1, "the fixture should contain one teaching slide");
  const slideXml = await archive.file(slidePaths[0]).async("string");
  const nativeShapeCount = (slideXml.match(/<p:sp>/g) ?? []).length;
  const pictureCount = (slideXml.match(/<p:pic>/g) ?? []).length;
  const mediaPaths = Object.keys(archive.files).filter((path) =>
    path.startsWith("ppt/media/") && !archive.files[path].dir
  );
  assert.ok(nativeShapeCount >= 10, `expected at least 10 native editable shapes, found ${nativeShapeCount}`);
  assert.equal(pictureCount, 0, "the teaching slide must not be a flattened picture");
  assert.equal(mediaPaths.length, 0, "the fixture must not contain a board screenshot in ppt/media");
  assert.match(slideXml, /Editable root/);
  assert.match(slideXml, /Editable child/);
  assert.match(slideXml, /Editable connector label/);
  console.log(`Verified ${nativeShapeCount} native editable PowerPoint shapes and no flattened images.`);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
