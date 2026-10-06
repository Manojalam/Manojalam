import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const compiled = ".tmp/matrix-color-smoke";
const build = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--outDir", compiled, "--rootDir", "src/lib", "--module", "commonjs", "--moduleResolution", "node", "--target", "ES2022", "--esModuleInterop", "--skipLibCheck", "src/lib/layout/layout-palette.ts"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const require = createRequire(import.meta.url);
const { DEFAULT_BOARD_SETTINGS } = require(`../${compiled}/types.js`);
const nodes = [
  ["root", null, 0, 0], ["branch-a", "root", 0, 100], ["a-1", "branch-a", 220, 100],
  ["a-1-child", "a-1", 440, 100], ["a-2", "branch-a", 220, 200], ["branch-b", "root", 0, 300],
  ["b-1", "branch-b", 220, 300],
].map(([id, parentId, x, y]) => ({ id, type: "shape", position: { x, y }, style: { width: 180, height: 70 }, data: {
  text: id, shapeType: "rectangle", parentId, childOrder: [], fontSize: 18,
  ...(id === "root" ? { layoutMode: "matrix", layoutColorScheme: "spectrum" } : { matrixRootId: "root" }),
} }));
for (const node of nodes) node.data.childOrder = nodes.filter((child) => child.data.parentId === node.id).map((child) => child.id);
const edges = nodes.filter((node) => node.data.parentId).map((node) => ({ id: `edge-${node.id}`, source: node.data.parentId, target: node.id, type: "branch" }));
const board = { id: "guest-matrix-colors", title: "Matrix colors smoke", userId: null, accessRole: "owner", storageMode: "local", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: {
  version: 1, nodes, edges, layers: [], relationships: [], relationshipFans: [], viewport: { x: 40, y: 40, zoom: 0.8 }, settings: DEFAULT_BOARD_SETTINGS,
} };
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
try {
  await page.setViewport({ width: 1600, height: 1100 });
  const base = process.env.BOARD_TEST_URL ?? "http://127.0.0.1:3107";
  await page.goto(`${base}/app/boards`, { waitUntil: "networkidle0" });
  await page.evaluate(async (board) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("manojalam-guest-boards", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.objectStore("boards").put(board);
    }); db.close();
  }, board);
  await page.goto(`${base}/app/boards/${board.id}`, { waitUntil: "networkidle0" });
  await page.locator('.react-flow__node[data-id="a-1"]').click();
  const automatic = page.locator('::-p-aria([name="AUTOMATIC COLORS"][role="button"])');
  await automatic.click();
  await page.waitForSelector('select[aria-label="Automatic color scope"]');
  assert.equal(await page.$eval('select[aria-label="Automatic color scope"]', (select) => select.value), "branch");
  await page.locator('::-p-aria([name="Forest"][role="radio"])').click();
  const readBoard = () => page.evaluate(async () => {
    const db = await new Promise((resolve) => { const request = indexedDB.open("manojalam-guest-boards", 1); request.onsuccess = () => resolve(request.result); });
    const board = await new Promise((resolve) => { const request = db.transaction("boards").objectStore("boards").get("guest-matrix-colors"); request.onsuccess = () => resolve(request.result); });
    db.close(); return board;
  });
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve) => { const request = indexedDB.open("manojalam-guest-boards", 1); request.onsuccess = () => resolve(request.result); });
    const board = await new Promise((resolve) => { const request = db.transaction("boards").objectStore("boards").get("guest-matrix-colors"); request.onsuccess = () => resolve(request.result); });
    db.close(); return board.content.nodes.find((node) => node.id === "a-1").data.layoutPaletteScope === true;
  });
  const saved = await readBoard();
  const byId = new Map(saved.content.nodes.map((node) => [node.id, node]));
  assert.equal(byId.get("a-1").data.layoutColorScheme, "forest");
  assert.equal(byId.get("a-1-child").data.layoutVisualStyle.scheme, "forest");
  assert.equal(byId.get("b-1").data.layoutVisualStyle.scheme, "spectrum");
  assert.equal(byId.get("a-1").data.layoutMode, undefined);
  await page.locator('::-p-aria([name="Undo"][role="button"])').click();
  await page.waitForFunction(() => document.querySelector('[role="radio"][aria-checked="true"]')?.textContent.trim() === "Spectrum");
  await page.locator('::-p-aria([name="Forest"][role="radio"])').click();
  await page.waitForFunction(() => document.querySelector('[role="radio"][aria-checked="true"]')?.textContent.trim() === "Forest");
  await page.select('select[aria-label="Automatic color scope"]', "chart");
  await page.waitForFunction(() => document.body.innerText.includes("Whole Matrix chart"));
  await page.screenshot({ path: ".tmp/matrix-child-colors.png" });
  await page.reload({ waitUntil: "networkidle0" });
  await page.locator('.react-flow__node[data-id="a-1"]').click();
  await automatic.click();
  assert.equal(await page.$eval('[role="radio"][aria-checked="true"]', (button) => button.textContent.trim()), "Forest");
  console.log("PASS: child automatic-color scope, branch persistence, unchanged siblings, undo, whole-chart choice and reload.");
} catch (error) { console.error(await page.evaluate(() => document.body.innerText)); throw error; }
finally { await browser.close(); }
