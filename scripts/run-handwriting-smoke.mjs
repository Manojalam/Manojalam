import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage(), errors = [], uploads = [];
page.on("pageerror", e => { errors.push(e.message); console.log("PAGE ERROR", e.message); });
page.on("requestfailed", r => console.log("REQUEST FAILED", r.url(), r.failure()));
page.on("request", r => { if (r.method() === "POST" && !r.url().startsWith(base)) uploads.push(r.url()); });
const click = async text => { const handle = await page.waitForFunction(text => [...document.querySelectorAll('[aria-label="Handwriting tools"] button')].find(b => b.textContent === text), {}, text); await handle.asElement().click(); };
try {
  await page.setViewport({width:1600,height:1000}); await page.goto(base);
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r=indexedDB.open("manojalam-guest-boards",1);r.onupgradeneeded=()=>r.result.createObjectStore("boards",{keyPath:"id"});r.onsuccess=()=>resolve(r.result); });
    await new Promise(resolve=> { const tx=db.transaction("boards","readwrite");tx.oncomplete=resolve;tx.objectStore("boards").put({id:"guest-ink",title:"Handwriting",storageMode:"local",accessRole:"owner",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}}); });db.close();
  });
  await page.goto(base+"/app/boards/guest-ink",{waitUntil:"networkidle0"});
  await page.click('[aria-label="Handwriting"]');
  await page.waitForSelector('[aria-label="Handwriting canvas"]');
  const draw = async points => { await page.mouse.move(...points[0]);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(...p,{steps:8});await page.mouse.up(); };
  // Hand-printed HELLO, expressed as pen strokes rather than a rendered font.
  for (const p of [
    [[650,450],[650,510]],[[690,450],[690,510]],[[650,480],[690,480]],
    [[750,450],[710,450],[710,510],[750,510]],[[710,480],[742,480]],
    [[770,450],[770,510],[810,510]],[[830,450],[830,510],[870,510]],
    [[910,450],[890,455],[885,480],[890,505],[910,510],[930,505],[935,480],[930,455],[910,450]]
  ]) await draw(p);
  await click("Done writing");
  assert.equal(await page.$$eval('.react-flow__node-handwriting', ns => ns.length), 1);
  const beforeErase = await page.$$eval('.react-flow__node-handwriting svg > g', els => els.length);
  await click("Stroke eraser"); await draw([[650,465],[655,465]]);
  assert.ok(await page.$$eval('.react-flow__node-handwriting svg > g', els => els.length) < beforeErase);
  await click("Undo"); await click("Done writing");
  assert.equal(await page.$$eval('.react-flow__node-handwriting svg > g', els => els.length), beforeErase);
  const original = await page.$eval('.react-flow__node-handwriting svg', el => el.innerHTML);
  await page.select('[aria-label="Handwriting language"]',"en");
  await click("Convert to text");
  await page.waitForSelector('[aria-label="Recognized text"]',{timeout:120000});
  const recognized = await page.$eval('[aria-label="Recognized text"]',el=>el.value);
  assert.match(recognized, /HELLO/i);
  console.log("Local English recognition:", recognized);
  assert.equal(await page.$eval('.react-flow__node-handwriting svg',el=>el.innerHTML),original);
  await click("Cancel conversion");
  assert.equal(await page.$$('.react-flow__node-text').then(ns=>ns.length),0);
  await click("Convert to text");await page.waitForSelector('[aria-label="Recognized text"]',{timeout:120000});
  await page.click('[aria-label="Recognized text"]');
  await page.keyboard.down("Control");await page.keyboard.press("a");await page.keyboard.up("Control");await page.keyboard.type("Hello");
  await click("Accept conversion");
  assert.equal(await page.$$('.react-flow__node-handwriting').then(ns=>ns.length),1);
  await page.waitForSelector('.react-flow__node-text');
  assert.match(await page.$eval('.react-flow__node-text',el=>el.textContent),/Hello/);
  await new Promise(r=>setTimeout(r,1800));
  await page.reload({waitUntil:"networkidle0"});
  assert.equal(await page.$$('.react-flow__node-handwriting').then(ns=>ns.length),1);
  assert.match(await page.$eval('.react-flow__node-text',el=>el.textContent),/Hello/);

  await page.click('.react-flow__node-handwriting');
  await page.select('[aria-label="Handwriting language"]',"sa");
  await click("Convert to text");
  const cancel = await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Handwriting tools"] button')].find(b => b.textContent === "Cancel"));
  await cancel.asElement().click();
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Handwriting tools"] button')].some(b => b.textContent === "Convert to text" && !b.disabled));
  assert.equal(await page.$$('.react-flow__node-handwriting').then(ns=>ns.length),1);
  await page.select('[aria-label="Handwriting language"]',"mixed");
  await click("Convert to text");await page.waitForSelector('[aria-label="Recognized text"]',{timeout:120000});
  await page.click('[aria-label="Recognized text"]');
  await page.keyboard.down("Control");await page.keyboard.press("a");await page.keyboard.up("Control");
  await page.keyboard.sendCharacter("भवति");
  await page.click('[aria-label="Handwriting tools"] input[type="checkbox"]');
  await click("Accept conversion");
  assert.equal(await page.$$('.react-flow__node-handwriting').then(ns=>ns.length),0);
  assert.ok(await page.$$eval('.react-flow__node-text',els=>els.some(el=>el.textContent.includes("भवति"))));
  await page.keyboard.down("Control");await page.keyboard.press("z");await page.keyboard.up("Control");
  await page.waitForSelector('.react-flow__node-handwriting');
  assert.deepEqual(uploads,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:".tmp/handwriting.png"});
  console.log("PASS drawing, local OCR, cancel preserves ink, accept keeps original, reload, no external uploads");
} catch (error) { await page.screenshot({path:".tmp/ink-failure.png"}); console.log(await page.$eval("body", el => el.innerText)); console.log(errors); throw error; } finally { await browser.close(); }
