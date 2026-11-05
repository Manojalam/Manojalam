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
    const nodes = ["root", "one", "two", "three"].map((id, i) => ({ id, type: "shape", position: { x: i ? 400 : 100, y: 160 + i * 100 }, style: { width: 220, height: 70 }, data: { text: id, shapeType: "rectangle", ...(i ? { parentId: "root", matrixRootId: "root" } : { layoutMode: "matrix", childOrder: ["one", "two", "three"] }) } }));
    const request = indexedDB.open("manojalam-guest-boards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve;
      tx.objectStore("boards").put({ id: "guest-fold-panel", title: "Matrix fold panel", storageMode: "local", accessRole: "owner", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes, edges: nodes.slice(1).map(n => ({ id: "e-" + n.id, source: "root", target: n.id })), settings: {}, viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(base + "/app/boards/guest-fold-panel", { waitUntil: "networkidle0" });
  await page.click('.react-flow__node[data-id="one"]');
  const properties = await page.$('[aria-label="Object properties"]'); if (properties) await properties.click();
  await page.click('[role="tab"]::-p-text(Style)');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Fill')?.click());
  const grid = '[aria-label="Color wheel families, light to dark"]';
  await page.waitForSelector(grid, { visible: true });
  assert.equal(await page.$eval(grid, el => el.querySelectorAll('section').length), 14);
  assert.equal(await page.$eval(grid, el => el.querySelectorAll('button').length), 140);
  const paletteBounds = await page.$eval(grid, el => ({height:el.getBoundingClientRect().height, width:el.getBoundingClientRect().width, scrollWidth:el.scrollWidth}));
  assert.ok(paletteBounds.height <= 360, 'all 14 families fit in a compact panel');
  assert.ok(await page.$eval(grid, el => [...el.querySelectorAll('button')].every(button => button.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1)), 'all swatches fit within the panel');
  const rows = await page.$eval(grid, el => [...el.querySelectorAll('section')].map(row => [...row.querySelectorAll('button')].map(b => {const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};})));
  assert.ok(rows.every(row => row.length === 10 && row.every(b => Math.abs(b.y-row[0].y)<1)), 'each family stays on one row');
  await page.click(grid + ' [aria-label="Select color #ff0000"]');
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="one"]')?.innerHTML.includes('rgb(255, 0, 0)'));
  await page.screenshot({ path: '.tmp/ordered-palette.png' });
  console.log('PASS: 140 colors, 14 ordered families, ten swatches per row, red applies to selected object.');
} finally { await browser.close(); }
