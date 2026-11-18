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
  const cells=await page.$$('[role="group"][data-row][data-column]');
  assert.ok(cells.length>3);
  const tools='[data-universal-text-tools="editor-toolbar"]';
  const enterCell=async index=>{
    await cells[index].click();
    await page.waitForSelector('[contenteditable="true"]');
    await page.click('[role="tab"]::-p-text(Text)');
    await page.waitForSelector(tools+' [aria-label="Bold"]');
    assert.equal(await page.$$eval('[data-universal-text-tools="inspector"] '+tools,els=>els.length),1,'exactly one active toolbar');
  };
  console.log('enter first');
  await enterCell(3);
  console.log('first tools ready');
  await page.keyboard.type('First cell');
  await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');
  await page.click(tools+' [aria-label="Bold"]');
  assert.match(await cells[3].evaluate(el=>el.innerHTML), /<strong>/);
  await page.click('[aria-label="Move table"]');
  console.log('after move', await page.$$eval('[contenteditable="true"]',els=>els.map(e=>e.outerHTML.slice(0,100))));
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Selected text controls"]'));
  assert.ok(await page.$('button[title="Bold"]'),'general text controls return when editing ends');
  console.log('enter second');
  await enterCell(4);
  console.log('second tools ready');
  await page.keyboard.type('Second cell');
  await page.waitForSelector(tools+' [aria-label="Bulleted list"]');
  await page.click(tools+' [aria-label="Bulleted list"]');
  assert.ok(await cells[4].$('ul'),'list targets new cell');
  assert.equal(await cells[3].$('ul'),null,'previous cell is unchanged');
  await page.click('[role="tab"]::-p-text(Style)');
  await page.click('[role="tab"]::-p-text(Text)');
  await page.waitForSelector(tools+' [aria-label="Font family"]');
  await page.click('[aria-label="Move table"]');
  await page.waitForFunction(()=>document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('table[aria-label="Editable table"]');
  assert.deepEqual(errors,[]);
  console.log('PASS: table text tools render at caret/selection, switch cell ownership, survive tab changes, and restore general controls after leaving a cell.');
} catch(error) {
  console.log(await page.evaluate(()=>({editable:[...document.querySelectorAll('[contenteditable="true"]')].map(e=>e.outerHTML.slice(0,200)), panels:[...document.querySelectorAll('[role="tabpanel"]')].map(e=>e.textContent.slice(0,250)), tools:document.querySelectorAll('[data-universal-text-tools="editor-toolbar"]').length})));
  throw error;
} finally { await browser.close(); }
