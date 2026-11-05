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
  await page.locator('::-p-aria([name="AUTOMATIC COLORS"][role="button"])').click();
  const alternate = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(el => el.textContent.trim() === 'Alternate row color').parentElement.parentElement);
  await alternate.evaluate(el => el.querySelector('[aria-label="Expand General colors"]')?.click());
  await alternate.evaluate(el => el.querySelector('[aria-label="Select color #ff5959"]').click());
  const hasColor = async (id, rgb) => page.waitForFunction((id, rgb) => [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] *`)].some(el => getComputedStyle(el).backgroundColor === rgb), {}, id, rgb);
  await hasColor('one', 'rgb(255, 191, 191)');
  await hasColor('two', 'rgb(255, 89, 89)');
  await hasColor('three', 'rgb(255, 191, 191)');
  for (const [hex, rgb] of [['#dfbfff','rgb(223, 191, 255)'], ['#8000ff','rgb(128, 0, 255)'], ['#1c0038','rgb(28, 0, 56)']]) {
    await page.click(`[aria-label="Select color ${hex}"]`);
    await hasColor('one', rgb);
    await hasColor('two', 'rgb(255, 89, 89)');
  }
  await page.waitForFunction(() => document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  await hasColor('one', 'rgb(28, 0, 56)');
  await hasColor('two', 'rgb(255, 89, 89)');
  console.log('PASS: exact alternating red shades, three purple tones, unchanged alternate, and reload.');
} finally { await browser.close(); }
