import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
page.on("dialog", d => d.accept());
try {
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(base);
  await page.evaluate(async () => {
    const nodes = ["root", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].map((id, i) => ({ id, type: "shape", position: { x: i ? 400 : 100, y: 160 + i * 100 }, style: { width: 220, height: 70 }, data: { text: id, shapeType: "rectangle", ...(i ? { parentId: "root", matrixRootId: "root" } : { layoutMode: "matrix", matrixChildFlow: "row", childOrder: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] }) } }));
    const request = indexedDB.open("manojalam-guest-boards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve;
      tx.objectStore("boards").put({ id: "guest-compact-fold", title: "Compact matrix fold", storageMode: "local", accessRole: "owner", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes, edges: nodes.slice(1).map(n => ({ id: "e-" + n.id, source: "root", target: n.id })), settings: {}, viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(base + "/app/boards/guest-compact-fold", { waitUntil: "networkidle0" });
  await page.click('.react-flow__node[data-id="one"]');
  const properties = await page.$('[aria-label="Object properties"]'); if (properties) await properties.click();
  await page.click('[role="tab"]::-p-text(Matrix)');
  const fold = '[aria-label="Fold matrix"] select[aria-label="Number of folded sections"]';
  await page.waitForSelector(fold);
  assert.equal(await page.$$eval(fold, items => items.length), 1);
  await page.select(fold, "3");
  await page.waitForSelector('[aria-label="Fold matrix"] [aria-label="Fold root presentation"]');
  
  await page.click('.react-flow__node[data-id="root"]');
  await page.click('[role="tab"]::-p-text(Matrix)');
  assert.equal(await page.$eval(fold, el => el.value), "3");
  assert.equal(await page.$$eval('[aria-label="Number of folded sections"]', els => els.length), 1, "root fold control is not duplicated");
  await page.click('.react-flow__node[data-id="one"]');
  await page.keyboard.down("Control"); await page.click('.react-flow__node[data-id="two"]'); await page.keyboard.up("Control");
  assert.ok(await page.$$eval('.react-flow__node.selected', els => els.length) > 1, "multiple cells selected");
  await page.click('[role="tab"]::-p-text(Matrix)');
  assert.equal(await page.$eval(fold, el => el.value), "3");
  await page.select(fold, "3");
  await page.waitForFunction(async () => {
    const r = indexedDB.open("manojalam-guest-boards", 1); const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const q = db.transaction("boards").objectStore("boards").get("guest-compact-fold"); const board = await new Promise(resolve => { q.onsuccess = () => resolve(q.result); }); db.close();
    return board.content.nodes.find(n => n.id === "root").data.layoutFoldCount === 3 && board.content.nodes.filter(n => n.id !== "root").every(n => !n.data.layoutFoldCount);
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.click('.react-flow__node[data-id="one"]');
  const props = await page.$('[aria-label="Object properties"]'); if (props) await props.click();
  await page.click('[role="tab"]::-p-text(Matrix)');
  assert.equal(await page.$eval(fold, el => el.value), "3");
  const boxes = await page.$$eval('.react-flow__node', els => els.filter(el => ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].includes(el.dataset.id)).map(el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: r.width, height: r.height }; }));
  assert.equal(boxes.length, 9);
  assert.equal(new Set(boxes.map(b => b.x)).size, 3);
  assert.equal(new Set(boxes.map(b => b.y)).size, 3);
  assert.ok(Math.max(...boxes.map(b => b.x + b.width)) - Math.min(...boxes.map(b => b.x)) < 1000);
  await page.screenshot({ path: ".tmp/compact-matrix-fold.png" });
  console.log("PASS: fold controls from leaf, root and multiple cells; root-only mutation; no duplicates; saved across reload.");
} finally { await browser.close(); }
