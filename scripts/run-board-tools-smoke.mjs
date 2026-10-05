// Start the app, then set BOARD_TEST_URL (and optionally BOARD_TEST_BROWSER).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const page = await browser.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const category = async name => { for (const item of await page.$$('nav[aria-label="Board tool categories"] button')) { if (await item.evaluate(el => el.textContent.trim()) === name) { await item.click(); return; } } throw Error(`Missing category ${name}`); };
const button = async name => {
  const handle = await page.waitForFunction(label => [...document.querySelectorAll("button")].find(el => (el.getAttribute("aria-label") === label || el.textContent.trim() === label) && el.getBoundingClientRect().width > 0), {}, name);
  await handle.asElement().click();
};
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("manojalam-guest-boards", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("boards", { keyPath: "id" });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      tx.objectStore("boards").put({ id: "guest-tool-groups-test", title: "Tool groups test", accessRole: "owner", storageMode: "local", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-tool-groups-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.react-flow__pane');
  const place = async () => {
    const point = await page.evaluate(() => {
      const bounds = document.querySelector('.react-flow__pane').getBoundingClientRect();
      for (let y = bounds.top + 100; y < bounds.bottom - 60; y += 80) {
        for (let x = bounds.left + 220; x < bounds.right - 60; x += 100) {
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
        }
      }
      throw Error('No empty canvas point');
    });
    const before = await page.$$eval('.react-flow__node', nodes => nodes.length);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(count => document.querySelectorAll('.react-flow__node').length === count + 1, {}, before);
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node.selected').length === 1);
  };
  for (const name of ['Sticky Note', 'Text', 'Table', 'Frame / swim lane']) {
    console.log('Create', name); await page.locator(`[aria-label="Create and navigate"] button[aria-label="${name}"]`).click(); await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(el => el.textContent?.includes('Place'))); await place();
  }
  await page.locator('[aria-label="Create and navigate"] button[aria-label="Shapes"]').click(); await button('Diamond'); await place();
  for (const name of ['Sanskrit Card', 'Śloka Card', 'Grammar Card']) {
    await page.locator('[aria-label="Create and navigate"] button[aria-label="Sanskrit tools"]').click(); await button(name); await place();
  }
  await page.click('.react-flow__node-shape');
  console.log('Formatting'); await category('Text');
  await button('Bold selected objects');
  await page.locator('input[aria-label="Font size for selected objects"]').fill('24');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('[aria-label="Bold selected objects"]', el => el.getAttribute('aria-pressed')), 'true');
  console.log('Board settings'); await category('Board');
  assert.equal(await page.$$eval('.react-flow__node.selected', nodes => nodes.length), 1, 'Board settings must preserve selection');
  await button('Typography');
  await page.waitForSelector('[aria-label="Board default font"]', { visible: true });
  console.log('Templates'); await category('Templates');
  await page.waitForSelector('[aria-label="Choose template"]', { visible: true });
  await page.waitForSelector('[aria-label="Sample templates"]', { visible: true });
  await category('Create');
  await button('Connector'); await page.keyboard.press('Escape');
  assert.equal(await page.$eval('[aria-label="Select"]', el => el.getAttribute('aria-pressed')), 'true');
  await button('Layouts'); await page.waitForSelector('[aria-label="Close layout picker"]', { visible: true }); await button('Close layout picker');
  await page.setViewport({ width: 390, height: 844 });
  console.log('Board settings'); await category('Board'); await button('Typography');
  await page.waitForSelector('[aria-label="Board default font"]', { visible: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Board tool groups: creation/selection, formatting, templates, board scope, Escape, layouts and phone checks passed.');
} catch (error) { mkdirSync(".tmp", { recursive: true }); await page.screenshot({path:".tmp/board-tools-failure.png"}); throw error; } finally {
  await browser.close();
}

