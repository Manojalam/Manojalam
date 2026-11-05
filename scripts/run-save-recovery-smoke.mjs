import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.setViewport({ width: 1400, height: 950 });
  await page.evaluateOnNewDocument(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === "manojalam-guest-boards" && sessionStorage.getItem("fail-save") === "yes") throw new DOMException("Simulated save outage", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  console.log("seed");
  await page.goto(base);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const nodes = [];
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `hsl(${i * 11}, 60%, 70%)`; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = "black"; ctx.font = "30px sans-serif"; ctx.fillText(`Slide ${i + 1}`, 30, 60);
      nodes.push({ id: `image-${i}`, type: "image", position: { x: 80, y: 80 + i * 450 }, style: { width: 640, height: 360 }, data: { image: {
        id: `asset-${i}`, kind: "image", name: `Slide ${i + 1}.png`, mimeType: "image/png", dataUrl: canvas.toDataURL(), size: 1000, width: 640, height: 360, createdAt: new Date().toISOString(),
      } } });
      nodes.push({ id: `note-${i}`, type: "shape", position: { x: 760, y: 80 + i * 450 }, style: { width: 400, height: 360 }, data: { shapeType: "rounded", text: `Notes ${i + 1}`, imageNotesFor: `Slide ${i + 1}.png`, noteForNodeId: `image-${i}` } });
    }
    const request = indexedDB.open("manojalam-guest-boards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve;
      tx.objectStore("boards").put({ id: "guest-save-recovery", title: "140 image board", storageMode: "local", accessRole: "owner", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { version: 1, nodes, edges: [], settings: {}, viewport: { x: 0, y: 0, zoom: 0.7 } } });
    }); db.close();
  });
  console.log("load board");
  await page.goto(base + "/app/boards/guest-save-recovery", { waitUntil: "networkidle0" });
  await page.waitForSelector('[aria-label="Board title"]');
  console.log("inject failure");
  await page.evaluate(() => sessionStorage.setItem("fail-save", "yes"));
  await page.click('[aria-label="Board title"]');
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.type('[aria-label="Board title"]', "Recovered 140 image board");
  await page.waitForSelector('button::-p-text(Retry save)', { timeout: 10000 });
  assert.match(await page.$eval('[role="alert"]', el => el.textContent), /Save failed/);
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes("recovery copy is saved"));
  console.log("error visible");
  await page.screenshot({ path: ".tmp/save-error-recovery.png" });
  // Reload despite the deliberately injected failure; this is an isolated test board.
  page.on("dialog", dialog => dialog.accept());
  console.log("before reload", await page.evaluate(async () => {
    const r = indexedDB.open("manojalam-board-recovery", 1);
    const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const read = db.transaction("backups").objectStore("backups").get("guest:guest-save-recovery");
    const backup = await new Promise(resolve => { read.onsuccess = () => resolve(read.result); }); db.close();
    return { title: document.querySelector('[aria-label="Board title"]')?.value, backup: backup?.board.title, pending: backup?.pending };
  }));
  console.log("reload");
  await page.reload({ waitUntil: "networkidle0" });
  console.log("after reload", await page.evaluate(() => ({ title: document.querySelector('[aria-label="Board title"]')?.value, alerts: [...document.querySelectorAll('[role="alert"]')].map(el => el.textContent) })));
  await page.waitForFunction(() => document.querySelector('[aria-label="Board title"]')?.value === "Recovered 140 image board");
  await page.waitForSelector('button::-p-text(Retry save)');
  await page.evaluate(() => sessionStorage.removeItem("fail-save"));
  console.log("retry");
  await page.click('button::-p-text(Retry save)');
  await page.waitForFunction(() => !document.body.textContent.includes("Save failed:"));
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log("before reload", await page.evaluate(async () => {
    const r = indexedDB.open("manojalam-board-recovery", 1);
    const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const read = db.transaction("backups").objectStore("backups").get("guest:guest-save-recovery");
    const backup = await new Promise(resolve => { read.onsuccess = () => resolve(read.result); }); db.close();
    return { title: document.querySelector('[aria-label="Board title"]')?.value, backup: backup?.board.title, pending: backup?.pending };
  }));
  console.log("reload");
  await page.reload({ waitUntil: "networkidle0" });
  console.log("after reload", await page.evaluate(() => ({ title: document.querySelector('[aria-label="Board title"]')?.value, alerts: [...document.querySelectorAll('[role="alert"]')].map(el => el.textContent) })));
  await page.waitForFunction(() => document.querySelector('[aria-label="Board title"]')?.value === "Recovered 140 image board");
  const persisted = await page.evaluate(async () => {
    const r = indexedDB.open("manojalam-guest-boards", 1);
    const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const read = db.transaction("boards").objectStore("boards").get("guest-save-recovery");
    const board = await new Promise(resolve => { read.onsuccess = () => resolve(read.result); }); db.close();
    return { count: board.content.nodes.length, images: board.content.nodes.filter(n => n.type === "image" && n.data.image.dataUrl.startsWith("data:image/")).length };
  });
  assert.deepEqual(persisted, { count: 280, images: 140 });
  assert.equal(await page.$('button::-p-text(Retry save)'), null);
  assert.ok(await page.$eval('.react-flow__node-image img', img => img.complete && img.naturalWidth > 0));
  assert.deepEqual(errors.filter(message => !message.includes("Simulated save outage")), []);
  console.log("PASS: 140 images + 140 notes, save failure details, local recovery after reload, retry, second reload and image rendering.");
} catch (error) { console.error(error); process.exitCode = 1; } finally { await browser.close(); }
