import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("dialog", dialog => dialog.accept());
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/app/boards`, { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("manojalam-guest-boards", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      tx.objectStore("boards").put({ id: "guest-table-test", title: "Table smoke test", description: "", accessRole: "owner", storageMode: "local", userId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-table-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector('button[aria-label="Table"]');
  await page.click('button[aria-label="Table"]');
  await page.click(".react-flow__pane", { offset: { x: 280, y: 180 } });
  await page.waitForSelector('table[aria-label="Editable table"]');
  assert.equal(await page.$$eval("tbody tr", rows => rows.length), 3);
  const tableBounds = () => page.$eval('.react-flow__node-table', element => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  const dragCorner = async (dx, dy) => {
    const handle = await page.$('.react-flow__node-table .react-flow__resize-control.bottom.right');
    const rect = await handle.boundingBox();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
  };
  const originalSize = await tableBounds();
  const originalRowHeight = await page.$eval('tbody tr', row => row.getBoundingClientRect().height);
  await dragCorner(100, 180);
  await page.waitForFunction(height => document.querySelector('.react-flow__node-table').getBoundingClientRect().height > height + 150, {}, originalSize.height);
  const grownSize = await tableBounds();
  assert.ok(grownSize.width > originalSize.width + 80);
  assert.ok(await page.$eval('tbody tr', row => row.getBoundingClientRect().height) > originalRowHeight + 20, "rows should fill the increased height");
  await page.locator('::-p-aria([name="Undo (⌘Z)"][role="button"])').click();
  await page.waitForFunction(height => Math.abs(document.querySelector('.react-flow__node-table').getBoundingClientRect().height - height) < 3, {}, originalSize.height);
  await dragCorner(0, 180);
  await page.waitForFunction(height => document.querySelector('.react-flow__node-table').getBoundingClientRect().height > height + 150, {}, originalSize.height);
  const resizedSize = await tableBounds();
  assert.ok(Math.abs(resizedSize.width - originalSize.width) < 3, "vertical drag should preserve width");
  const assertGridFills = async () => {
    await page.waitForFunction(() => {
      const table=document.querySelector('table[aria-label="Editable table"]');
      const box=table.parentElement.getBoundingClientRect();
      const grid=table.getBoundingClientRect();
      return Math.abs(box.bottom-grid.bottom-1)<2;
    });
    const remaining=await page.$eval('tbody tr:last-child',row=>[...row.cells].map(cell=>cell.getBoundingClientRect().bottom));
    assert.ok(remaining.every(bottom=>Math.abs(bottom-remaining[0])<1),'all column borders reach the final row');
  };
  await assertGridFills();
  await page.waitForFunction(()=>document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('table[aria-label="Editable table"]');
  await assertGridFills();
  assert.ok(Math.abs((await tableBounds()).height-resizedSize.height)<3,'expanded height survives reload');
  await page.click('[aria-label="Move table"]');
  await dragCorner(0,-90);
  await assertGridFills();
  assert.ok((await tableBounds()).height<resizedSize.height-60,'table can shrink after expansion');
  assert.deepEqual(errors,[]);
  console.log('PASS: rows fill expanded table during resize and after reload, undo restores size, columns reach the bottom, and shrinking works.');
} finally { await browser.close(); }
