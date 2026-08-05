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
const foldedOutputFile = join(outputDirectory, "editable-folded-matrix-smoke-test.pptx");
const typeScriptCli = join(workspace, "node_modules", "typescript", "bin", "tsc");
const keepArtifacts = process.env.KEEP_POWERPOINT_SMOKE === "1";

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
  const { buildPresentationStops } = require(join(outputDirectory, "lib", "canvas", "presentation.js"));
  const root = {
    id: "root",
    type: "shape",
    position: { x: 350, y: 40 },
    width: 220,
    height: 90,
    data: {
      shapeType: "rounded",
      richText: '<p><strong>Editable root</strong></p><p>Complete explanation for the detail slide.</p><p><a href="https://example.com/rule">Source rule</a></p>',
      fillColor: "#dbeafe",
    },
  };
  const children = Array.from({ length: 15 }, (_, index) => ({
    id: `child-${index + 1}`,
    type: "shape",
    position: {
      x: 20 + (index % 3) * 310,
      y: 250 + Math.floor(index / 3) * 130,
    },
    width: 260,
    height: 90,
    data: {
      parentId: "root",
      shapeType: "rounded",
      text: `Editable child ${index + 1}\nA deliberately long explanation that belongs on a detail slide, not in the overview card.`,
      fillColor: index % 2 ? "#dcfce7" : "#fef3c7",
    },
  }));
  const edges = children.map((child, index) => ({
    id: `root-child-${index + 1}`,
    source: "root",
    target: child.id,
    hidden: true,
    data: {
      label: index === 0 ? "Editable connector label" : undefined,
      arrowEnd: true,
      ...(index === 0 ? {
        sourceAnchor: { x: 0, y: 50, side: "left" },
        targetAnchor: { x: 100, y: 50, side: "right" },
        waypoints: [{ x: 315, y: 85 }, { x: 315, y: 295 }],
      } : {}),
    },
  }));
  await downloadEditablePowerPoint({
    boardTitle: "Editable teaching smoke test",
    nodes: [root, ...children],
    edges,
    relationships: [],
    stops: [
      {
        id: "overview",
        kind: "overview",
        title: "Editable board overview",
        nodeIds: ["root", ...children.map((child) => child.id)],
      },
      {
        id: "detail",
        kind: "branch",
        title: "Editable root detail",
        nodeIds: ["root"],
      },
    ],
    filename: outputFile,
  });

  const archive = await JSZip.loadAsync(await readFile(outputFile));
  const slidePaths = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  assert.equal(slidePaths.length, 17, "dense content should gain editable automatic detail slides");
  const overviewXml = await archive.file("ppt/slides/slide1.xml").async("string");
  const detailXml = await archive.file("ppt/slides/slide2.xml").async("string");
  const automaticDetailXml = await archive.file("ppt/slides/slide3.xml").async("string");
  const detailRelationships = await archive.file("ppt/slides/_rels/slide2.xml.rels").async("string");
  const slideXml = `${overviewXml}${detailXml}`;
  const nativeShapeCount = (slideXml.match(/<p:sp>/g) ?? []).length;
  const connectorShapeCount = (overviewXml.match(/<a:prstGeom prst="line"/g) ?? []).length;
  const editableNodeBlocks = [...overviewXml.matchAll(/<p:sp>(?:(?!<p:sp>)[\s\S])*?name="Editable shape:[\s\S]*?<\/p:sp>/g)]
    .map((match) => match[0]);
  const editableNodeFontSizes = editableNodeBlocks.flatMap((block) =>
    [...block.matchAll(/\bsz="(\d+)"/g)].map((match) => Number(match[1]))
  );
  const pictureCount = (slideXml.match(/<p:pic>/g) ?? []).length;
  const mediaPaths = Object.keys(archive.files).filter((path) =>
    path.startsWith("ppt/media/") && !archive.files[path].dir
  );
  assert.ok(nativeShapeCount >= 35, `expected at least 35 native editable shapes, found ${nativeShapeCount}`);
  assert.ok(connectorShapeCount >= 15, "hidden structured-layout edges must remain editable connectors in the deck");
  assert.equal(pictureCount, 0, "the teaching slide must not be a flattened picture");
  assert.equal(mediaPaths.length, 0, "the fixture must not contain a board screenshot in ppt/media");
  assert.match(overviewXml, /Editable root/);
  assert.doesNotMatch(overviewXml, /Complete explanation/);
  assert.ok(editableNodeBlocks.length >= 16, "the overview should retain every editable chart node");
  assert.ok(
    editableNodeFontSizes.length > 0 && Math.min(...editableNodeFontSizes) >= 1600,
    "overview chart labels must use at least 16-point text"
  );
  assert.match(overviewXml, /Editable child 15/);
  assert.match(overviewXml, /Editable connector label/);
  assert.match(detailXml, /Complete explanation/);
  assert.match(detailXml, /<a:hlinkClick/);
  assert.match(detailRelationships, /https:\/\/example\.com\/rule/);
  assert.match(automaticDetailXml, /deliberately long explanation/);
  console.log(`Verified ${nativeShapeCount} native editable shapes, ${connectorShapeCount} connectors, readable dense-overview labels, automatic detail slides, hyperlinks, and no flattened images.`);

  const matrixRoot = {
    id: "matrix-root",
    type: "shape",
    position: { x: 0, y: 0 },
    style: { width: 540, height: 48 },
    data: {
      text: "Folded Matrix",
      layoutMode: "matrix",
      matrixCell: true,
      matrixFoldRootMode: "continuous",
      matrixFoldSections: [
        { x: 0, y: 48, width: 240, height: 200, repeatedCells: [] },
        { x: 300, y: 48, width: 240, height: 200, repeatedCells: [] },
      ],
      fillColor: "#f9a8d4",
    },
  };
  const matrixBranches = [
    {
      id: "matrix-a",
      type: "shape",
      position: { x: 0, y: 48 },
      style: { width: 240, height: 200 },
      data: { text: "First fold", parentId: "matrix-root", fillColor: "#dbeafe" },
    },
    {
      id: "matrix-b",
      type: "shape",
      position: { x: 300, y: 48 },
      style: { width: 240, height: 200 },
      data: { text: "Second fold", parentId: "matrix-root", fillColor: "#dcfce7" },
    },
  ];
  const matrixFrames = matrixBranches.map((branch, index) => ({
    id: `matrix-frame-${index}`,
    type: "frame",
    position: { x: index * 300, y: 48 },
    style: { width: 240, height: 200 },
    data: {
      title: "",
      matrixFrameFor: "matrix-root",
      matrixFoldSectionIndex: index,
      matrixFoldSectionNodeIds: [branch.id],
    },
  }));
  const matrixEdges = matrixBranches.map((branch, index) => ({
    id: `matrix-edge-${index}`,
    source: "matrix-root",
    target: branch.id,
    hidden: true,
    data: { hiddenInMatrix: true, hiddenInMatrixFor: "matrix-root" },
  }));
  const matrixNodes = [matrixRoot, ...matrixBranches, ...matrixFrames];
  const matrixStops = buildPresentationStops(matrixNodes, matrixEdges);
  assert.deepEqual(matrixStops.map((stop) => stop.kind), [
    "overview",
    "matrix-fold",
    "matrix-fold",
  ]);
  await downloadEditablePowerPoint({
    boardTitle: "Folded Matrix smoke test",
    nodes: matrixNodes,
    edges: matrixEdges,
    relationships: [],
    stops: matrixStops,
    filename: foldedOutputFile,
  });
  const matrixArchive = await JSZip.loadAsync(await readFile(foldedOutputFile));
  const matrixSlidePaths = Object.keys(matrixArchive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  assert.equal(matrixSlidePaths.length, 3, "the folded Matrix should export as overview plus two folds");
  const firstFoldXml = await matrixArchive.file("ppt/slides/slide2.xml").async("string");
  const secondFoldXml = await matrixArchive.file("ppt/slides/slide3.xml").async("string");
  assert.match(firstFoldXml, /Fold 1 · First fold/);
  assert.match(firstFoldXml, /Folded Matrix/);
  assert.match(firstFoldXml, /First fold/);
  assert.doesNotMatch(firstFoldXml, /Second fold/);
  assert.match(secondFoldXml, /Fold 2 · Second fold/);
  assert.match(secondFoldXml, /Folded Matrix/);
  assert.match(secondFoldXml, /Second fold/);
  assert.doesNotMatch(secondFoldXml, /First fold/);
  console.log("Verified authored Matrix Fold sections export as compact editable teaching slides.");
  if (keepArtifacts) console.log(`Kept verification deck at ${outputFile}`);
  if (keepArtifacts) console.log(`Kept folded Matrix verification deck at ${foldedOutputFile}`);
} finally {
  if (!keepArtifacts) await rm(outputDirectory, { recursive: true, force: true });
}
