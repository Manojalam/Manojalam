import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

// Run against npm run dev; this uses an isolated browser profile and device boards.
const base = process.env.BOARD_TEST_URL ?? "http://127.0.0.1:3107";
const browser = await puppeteer.launch({
  executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage();
try {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") console.error(message.text()); });
  await page.goto(`${base}/app/boards`, { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("manojalam-guest-boards", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      for (const [id, title, description, date] of [["guest-alpha", "Alpha", "Language study", "2026-01-01"], ["guest-beta", "Beta", "Sanskrit notes", "2026-02-01"]]) {
        tx.objectStore("boards").put({ id, title, description, accessRole: "owner", storageMode: "local", userId: null, createdAt: date, updatedAt: date, content: { nodes: [], edges: [] } });
      }
    });
    db.close();
  });
  await page.reload({ waitUntil: "networkidle0" });
  console.log("Loaded board list", page.url());
  const button = (name) => page.locator(`::-p-aria([name="${name}"][role="button"])`);
  await button("New folder").click();
  await page.locator("#folder-name").fill("Studies");
  await button("Save folder").click();
  await page.waitForSelector('select[aria-label="Folder for Beta"] option[value]:not([value=""])');
  const folderId = await page.$eval('select[aria-label="Folder for Beta"]', (select) => select.options[1].value);
  await page.select('select[aria-label="Folder for Beta"]', folderId);
  await page.waitForFunction((id) => document.querySelector('select[aria-label="Folder for Beta"]').value === id, {}, folderId);
  await button("Studies").click();
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Folder for Alpha"]'));
  await button("Rename Studies").click();
  await page.locator("#folder-name").fill("Reading");
  await button("Save folder").click();
  await page.waitForSelector('button[aria-label="Rename Reading"]');
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval('select[aria-label="Folder for Beta"]', (select) => select.selectedOptions[0].textContent), "Reading");
  await page.locator('input[aria-label="Search boards"]').fill("sanskrit");
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Folder for Alpha"]'));
  await page.focus('input[aria-label="Search boards"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.select('select[aria-label="Sort boards"]', "title-asc");
  await page.waitForFunction(() => document.querySelector("h3 a")?.textContent === "Alpha");
  await button("Reading").click();
  page.once("dialog", (dialog) => dialog.accept());
  await button("Delete folder Reading").click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Folder for Beta"]')?.value === "");
  assert.equal(await page.$$eval("h3 a", (links) => links.length), 2);
  await button("New folder").click();
  await page.locator("#folder-name").fill("Parent");
  await button("Save folder").click();
  await button("Parent").click();
  await button("New subfolder").click();
  await page.locator("#folder-name").fill("Child");
  await button("Save folder").click();
  await button("Child").click();
  await button("New subfolder").click();
  await page.locator("#folder-name").fill("Grandchild");
  await button("Save folder").click();
  await button("All boards").click();
  const grandchildId = await page.$eval('select[aria-label="Folder for Alpha"]', (select) => [...select.options].find((option) => option.textContent === "Parent / Child / Grandchild").value);
  await page.select('select[aria-label="Folder for Alpha"]', grandchildId);
  await page.waitForFunction((id) => document.querySelector('select[aria-label="Folder for Alpha"]').value === id, {}, grandchildId);
  await page.reload({ waitUntil: "networkidle0" });
  await button("Parent").click();
  await button("Child").click();
  const allowedParents = await page.$$eval("#parent-folder option", (options) => options.map((option) => option.textContent));
  assert.deepEqual(allowedParents, ["Top level", "Parent"]);
  await button("Grandchild").click();
  assert.equal(await page.$eval('nav[aria-label="Folder breadcrumbs"]', (nav) => nav.textContent), "Folders/Parent/Child/Grandchild");
  assert.equal(await page.$eval("h3 a", (link) => link.textContent), "Alpha");
  await button("Child").click(); // breadcrumb back to parent
  await page.select("#parent-folder", "");
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Folder breadcrumbs"]').textContent === "Folders/Child");
  page.once("dialog", (dialog) => dialog.accept());
  await button("Delete folder Child").click();
  await button("Grandchild").click();
  assert.equal(await page.$eval("h3 a", (link) => link.textContent), "Alpha");
  await button("All boards").click();
  // Click the card's metadata, outside the title link's original bounds.
  await page.$eval('h3 a[href="/app/boards/guest-alpha"]', (link) => link.scrollIntoView({ block: "center" }));
  const cardPoint = await page.$eval('h3 a[href="/app/boards/guest-alpha"]', (link) => {
    const rect = link.closest("h3").parentElement.parentElement.querySelector("p").getBoundingClientRect();
    return { x: rect.x + 15, y: rect.y + 5 };
  });
  await Promise.all([page.waitForFunction(() => location.pathname === "/app/boards/guest-alpha"), page.mouse.click(cardPoint.x, cardPoint.y)]);
  assert.deepEqual(errors, []);
  console.log("PASS: create, assign, filter, rename, reload, search, sort, nested navigation, cycle-safe moves, child promotion and clickable board cards.");
} catch (error) {
  console.error(await page.evaluate(() => document.body.innerText));
  throw error;
} finally { await browser.close(); }
