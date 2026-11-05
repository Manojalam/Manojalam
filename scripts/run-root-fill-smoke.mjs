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
    const nodes = ["root", "one", "two", "three"].map((id, i) => ({ id, type: "shape", position: { x: i ? 400 : 100, y: 160 + i * 100 }, style: { width: 220, height: 70 }, data: { text: id, shapeType: "rectangle", ...(i ? { parentId: "root", matrixRootId: "root" } : { layoutMode: "matrix", layoutColorPattern: "alternating", layoutStartColor: "#ffbfbf", layoutEndColor: "#ffff00", childOrder: ["one", "two", "three"] }) } }));
    const request = indexedDB.open("manojalam-guest-boards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve;
      tx.objectStore("boards").put({ id: "guest-fold-panel", title: "Matrix fold panel", storageMode: "local", accessRole: "owner", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes, edges: nodes.slice(1).map(n => ({ id: "e-" + n.id, source: "root", target: n.id })), settings: {}, viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(base + "/app/boards/guest-fold-panel", { waitUntil: "networkidle0" });
  await page.click('.react-flow__node[data-id="root"]');
  const properties = await page.$('[aria-label="Object properties"]'); if (properties) await properties.click();
  await page.click('[role="tab"]::-p-text(Style)');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Fill')?.click());
  const hasColor = async (id, rgb) => page.waitForFunction((id, rgb) => [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] *`)].some(el => getComputedStyle(el).backgroundColor === rgb), {}, id, rgb);
  await hasColor('one', 'rgb(255, 191, 191)');
  await hasColor('two', 'rgb(255, 255, 0)');
  await page.click('[aria-label="Select color #ffe6ff"]');
  await hasColor('root', 'rgb(255, 230, 255)');
  await hasColor('one', 'rgb(255, 191, 191)');
  await hasColor('two', 'rgb(255, 255, 0)');
  await hasColor('three', 'rgb(255, 191, 191)');
  await page.waitForFunction(() => document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  await hasColor('root', 'rgb(255, 230, 255)');
  await hasColor('one', 'rgb(255, 191, 191)');
  await hasColor('two', 'rgb(255, 255, 0)');
  console.log('PASS: root fill changes independently; alternating children survive editing and reload.');
} finally { await browser.close(); }
