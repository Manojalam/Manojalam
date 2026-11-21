import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const button = name => page.locator(`::-p-aria([name="${name}"][role="button"])`);
try {
  await page.setViewport({ width: 1500, height: 1000 });
  await page.goto(`${base}/app/boards`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    localStorage.setItem('theme', 'dark');
    const db = await new Promise(resolve => { const r = indexedDB.open('manojalam-guest-boards', 1); r.onupgradeneeded = () => r.result.createObjectStore('boards', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => {
      const tx = db.transaction('boards', 'readwrite'); tx.oncomplete = resolve;
      for (const [id, color, mode] of [['light', '#ffffff', 'custom'], ['dark', '#18181d', 'custom'], ['auto', '#ffffff', 'auto'], ['translucent', '#18181d', 'custom']]) {
        tx.objectStore('boards').put({ id: 'guest-appearance-' + id, title: 'Appearance ' + id, storageMode: 'local', accessRole: 'owner', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [{ id: 'shape', type: 'shape', position: { x: 100, y: 100 }, style: { width: 300, height: 150 }, data: { text: 'Preview object', fillColor: '#ffffff', fillOpacity: id === 'translucent' ? 0.5 : 1 } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, settings: { canvasBackgroundColor: color, canvasBackgroundMode: mode } } });
      }
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-appearance-dark`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.dataset.boardAppearance === 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark');
  assert.equal(await page.$eval('body', el => getComputedStyle(el).getPropertyValue('--popover').trim()), '#252529');
  await page.click('[data-id="shape"]');
  console.log('opening templates'); await button('Templates').click();
  console.log('opening designer'); await button('Create template').click();
  await page.waitForSelector('[aria-label="Preview background"]');
  assert.equal(await page.$eval('[aria-label="Preview background"]', el => el.value), 'object');
  assert.equal(await page.$eval('[data-template-preview-surface]', el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await page.select('[aria-label="Preview background"]', 'dark');
  assert.equal(await page.$eval('[data-template-preview-surface]', el => getComputedStyle(el).backgroundColor), 'rgb(24, 24, 29)');
  await page.select('[aria-label="Preview background"]', 'white');
  console.log('opening picker'); await button('Choose default text').click();
  await page.waitForSelector('[data-radix-popper-content-wrapper]');
  await page.waitForFunction(() => document.querySelector('[data-radix-popper-content-wrapper] [data-app-color-picker]')?.getAttribute('data-picker-appearance') === 'light');
  assert.equal(await page.$eval('[data-radix-popper-content-wrapper] [data-app-color-picker]', el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.$eval('[aria-label="Color preview on selected object"]', el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.evaluate(() => document.body.dataset.boardAppearance), 'dark');
  await page.screenshot({ path: '.tmp/object-white-color-picker.png' });
  await page.keyboard.press('Escape');
  console.log('closing designer'); await button('Cancel').click();
  await page.goto(`${base}/app/boards/guest-appearance-translucent`, { waitUntil: 'networkidle0' });
  await page.click('[data-id="shape"]');
  await button('Templates').click();
  await button('Create template').click();
  await button('Choose default text').click();
  await page.waitForSelector('[aria-label="Color preview on selected object"]');
  assert.equal(await page.$eval('[aria-label="Color preview on selected object"]', el => getComputedStyle(el).backgroundColor), 'rgb(140, 140, 142)');
  await page.goto(`${base}/app/boards/guest-appearance-dark`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.dataset.boardAppearance === 'dark');
  await page.goto(`${base}/app/boards/guest-appearance-auto`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.react-flow');
  assert.equal(await page.evaluate(() => document.body.hasAttribute('data-board-appearance')), false);
  assert.equal(await page.$eval('body', el => getComputedStyle(el).getPropertyValue('--popover').trim()), '#252529');
  await page.goto(`${base}/app/boards`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => document.body.hasAttribute('data-board-appearance')), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark');
  assert.deepEqual(errors, []);
  console.log('PASS: White object picker and text sample on a dark board without changing board or app theme');
} catch (error) {
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 2500)));
  await page.screenshot({ path: '.tmp/board-appearance-failure.png' });
  throw error;
} finally { await browser.close(); }



