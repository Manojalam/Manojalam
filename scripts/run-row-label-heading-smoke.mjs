import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const header = '[aria-label="Row label heading"]';
try {
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto(base);
  await page.evaluate(async () => {
    const db = await new Promise(resolve => {
      const request = indexedDB.open("manojalam-guest-boards", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite");
      tx.oncomplete = resolve;
      tx.objectStore("boards").put({
        id: "guest-row-heading", title: "Row heading", storageMode: "local", accessRole: "owner",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        content: { nodes: [{ id: "table", type: "table", position: { x: 120, y: 180 }, style: { width: 600, height: 240 },
          data: { table: { showRowLabels: true, columns: [{ id: "c1", name: "Column 1" }], rows: [{ id: "r1", label: "First", cells: ["Answer"] }] } } }],
          edges: [], settings: {}, viewport: { x: 0, y: 0, zoom: 1 } }
      });
    });
    db.close();
  });
  await page.goto(base + "/app/boards/guest-row-heading", { waitUntil: "networkidle0" });
  await page.click(header);
  await page.waitForSelector(header + ' [contenteditable="true"]');
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.type("Case");
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.press("Tab");
  assert.equal(await page.$eval('[aria-label="Column 1 name"]', el => el.contains(document.activeElement)), true);
  await page.waitForFunction(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open("manojalam-guest-boards", 1); r.onsuccess = () => resolve(r.result); });
    const board = await new Promise(resolve => { const r = db.transaction("boards").objectStore("boards").get("guest-row-heading"); r.onsuccess = () => resolve(r.result); });
    db.close();
    return board?.content.nodes[0].data.table.labelHeader === "Case";
  });
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval(header, el => el.textContent), "Case");
  assert.equal(await page.$eval('[aria-label="Row 1 label"]', el => el.textContent), "First");
  assert.equal(await page.$eval('[aria-label="Row 1, Column 1"]', el => el.textContent), "Answer");
  assert.deepEqual(errors, []);
  console.log("PASS rename row-label heading, keyboard navigation, persisted reload and unaffected cells");
} finally { await browser.close(); }
