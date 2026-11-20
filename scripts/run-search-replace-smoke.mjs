import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
  await page.setViewport({ width: 1500, height: 1000 });
  await page.goto(`${base}/app/boards`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('manojalam-guest-boards', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('boards', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const nodes = [
      { id: 'shape', type: 'shape', position: { x: 0, y: 0 }, style: { width: 500, height: 150 }, data: { text: 'कृतिः कृतिः', richText: '<p><strong>कृतिः</strong> <a href="https://example.com/keep">कृतिः</a></p>' } },
      { id: 'table', type: 'table', position: { x: 0, y: 350 }, data: { table: { columns: [{ id: 'c', name: 'Heading' }], rows: [{ id: 'r1', cells: ['कृतिः'], richCells: { c: '<p><strong>कृतिः</strong></p>' } }, { id: 'r2', cells: ['कृतिः'] }] } } },
      { id: 'locked', type: 'shape', position: { x: 700, y: 0 }, style: { width: 300, height: 100 }, data: { text: 'कृतिः', locked: true } },
    ];
    await new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      tx.objectStore('boards').put({ id: 'guest-replace-test', title: 'Replace test', storageMode: 'local', accessRole: 'owner', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes, edges: [], viewport: { x: 50, y: 150, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-replace-test`, { waitUntil: 'networkidle0' });
  const open = async () => { await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control'); };
  const clickText = async text => { await page.locator(`::-p-aria(${text}[role="button"])`).click(); };
  const counter = async text => page.waitForFunction(text => document.querySelector('[role="search"] [role="status"]')?.textContent === text, {}, text);
  await open();
  await page.locator('[aria-label="Search board"]').fill('कृति');
  await counter('1 of 5');
  await clickText('Replace…');
  await page.locator('[aria-label="Replace with"]').fill('प्रकृति');
  await clickText('Replace');
  await page.waitForFunction(() => document.querySelector('[data-id="shape"] strong')?.textContent === 'प्रकृतिः');
  await counter('2 of 5'); // Replacement itself contains the query; continue past it.
  assert.equal(await page.$eval('[data-id="shape"] a', a => a.getAttribute('href')), 'https://example.com/keep');
  await page.keyboard.press('Escape');
  await open(); // Scope now captures the shape.
  await counter('1 of 2');
  await page.locator('[aria-label="Replace with"]').fill('शक्ति');
  await clickText('Replace all');
  await counter('No matches');
  await page.keyboard.press('Escape');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await page.waitForFunction(() => document.querySelector('[data-id="shape"] a')?.textContent === 'कृतिः');
  await open();
  await page.select('[aria-label="Search scope"]', 'board');
  await counter('1 of 5');
  await page.locator('[aria-label="Replace with"]').fill('<new>');
  await clickText('Replace all');
  await counter('1 of 1'); // Locked object is unchanged.
  await page.waitForFunction(() => document.querySelector('[role="search"]')?.textContent.includes('4 replacements; 1 locked'));
  await page.keyboard.press('Escape');
  // Wait for the local board to persist, then verify reload and rich/table caches.
  await page.waitForFunction(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('manojalam-guest-boards', 1); r.onsuccess = () => resolve(r.result); });
    const board = await new Promise(resolve => { const r = db.transaction('boards').objectStore('boards').get('guest-replace-test'); r.onsuccess = () => resolve(r.result); }); db.close();
    return board?.content.nodes.find(n => n.id === 'table')?.data.table.rows[1].cells[0] === '<new>ः';
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await open();
  await page.select('[aria-label="Search scope"]', 'board');
  await page.locator('[aria-label="Search board"]').fill('<new>');
  await counter('1 of 4');
  assert.equal(await page.$('[data-id="shape"] new'), null, 'Replacement must not insert HTML elements');
  await page.screenshot({ path: '.tmp/search-replace.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: Single replacement, advance, scope, Replace all, one-step undo, locked skip, literal HTML, formatting/link preservation, table caches and reload');
} catch (error) {
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 2000)));
  await page.screenshot({ path: '.tmp/search-replace-failure.png' });
  throw error;
} finally { await browser.close(); }
