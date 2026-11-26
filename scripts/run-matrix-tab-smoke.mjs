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
    nodes.push({id:"other",type:"shape",position:{x:700,y:160},style:{width:220,height:70},data:{text:"Other matrix",layoutMode:"matrix"}}, {id:"plain",type:"shape",position:{x:700,y:550},style:{width:220,height:70},data:{text:"Plain shape"}});
    const request = indexedDB.open("manojalam-guest-boards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve;
      tx.objectStore("boards").put({ id: "guest-fold-panel", title: "Matrix fold panel", storageMode: "local", accessRole: "owner", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes, edges: nodes.slice(1,4).map(n => ({ id: "e-" + n.id, source: "root", target: n.id })), settings: {}, viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(base + "/app/boards/guest-fold-panel", { waitUntil: "networkidle0" });
  await page.click('[data-id="root"]');
  await page.click('[role="tab"]::-p-text(Matrix)');
  const active = () => page.$eval('[role="tab"][aria-selected="true"]', el=>el.textContent);
  for (const id of ['other', 'one', 'root', 'other']) {
    await page.click(`[data-id="${id}"]`);
    assert.equal(await active(), 'Matrix', `Matrix remains active on ${id}`);
  }
  await page.click('[data-id="plain"]');
  assert.equal(await active(),'Style','Incompatible objects use their normal tab');
  console.log('PASS: Matrix tab stays open between matrices, cells and roots; plain shape falls back');
} finally { await browser.close(); }