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
  const bounds = () => page.$eval('.react-flow__node-table',el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y};});
  const drag = async (selector, dx, dy) => {
    const rect=await (await page.$(selector)).boundingBox();
    const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();
  };
  const before=await bounds();
  await drag('tbody td',40,25);
  assert.deepEqual(await bounds(),before,'cell selection must not drag the table');
  await drag('[aria-label="Move table"]',120,90);
  const moved=await bounds();
  assert.ok(moved.x-before.x>100 && moved.y-before.y>70,'handle must move the whole table');
  await page.click('button[title="Undo (⌘Z)"]');
  assert.deepEqual(await bounds(),before,'move can be undone');
  await drag('[aria-label="Move table"]',100,60);
  const savedBounds=await bounds();
  await page.waitForFunction(()=>document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  assert.deepEqual(await bounds(),savedBounds,'position survives reload');
  await page.click('[aria-label="Move table"]');
  await page.click('[aria-label="Lock selected objects"]');
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Move table"]'));
  assert.deepEqual(errors,[]);
  console.log('PASS: cell selection stays editable; move handle drags table, supports undo and reload; locked table has no move handle.');
} finally { await browser.close(); }
