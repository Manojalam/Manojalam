import assert from "node:assert/strict";
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
      tx.objectStore("boards").put({ id: "guest-table-test", title: "Table smoke test", description: "", accessRole: "owner", storageMode: "local", userId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [{id:"other",type:"shape",position:{x:0,y:0},data:{text:"English needle marker",richText:"<p>English <strong>needle</strong> marker</p>"},style:{width:200,height:100}},{id:"table-search",type:"table",position:{x:5000,y:5000},data:{table:{columns:[{id:"c",name:"Meaning"}],rows:Array.from({length:40},(_,i)=>({id:"r"+i,cells:[i===39?"गुणत्वम्":"Other row "+i],...(i===39?{richCells:{c:"<p><strong>गुण</strong>त्वम्</p>"}}:{})}))}}}], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-table-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.react-flow');
  await page.waitForSelector('[aria-label="Zoom out"]');
  await page.click('[aria-label="Zoom out"]');
  await page.click('[aria-label="Zoom out"]');
  await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
  await page.waitForSelector('[aria-label="Search board"]');
  await page.locator('[aria-label="Search board"]').fill('गुणत्वम्');
  await page.waitForSelector('[role="dialog"] button::-p-text(गुणत्वम्)');
  const before=await page.$eval('.react-flow__viewport',el=>el.style.transform);
  await page.click('[role="dialog"] button::-p-text(गुणत्वम्)');
  await page.waitForFunction(previous=>document.querySelector('.react-flow__viewport').style.transform!==previous,{},before);
  await page.waitForSelector('[role="tab"]::-p-text(Table)');
  await page.waitForFunction(() => {
    const box=document.querySelector('[data-id="table-search"]')?.getBoundingClientRect();
    return box && box.right>0 && box.bottom>0 && box.left<innerWidth && box.top<innerHeight;
  });
  assert.equal(await page.$('[role="dialog"]'),null);
  await page.waitForFunction(() => {
    const highlights=CSS.highlights.get('board-search-match');
    if (!highlights || !highlights.size) return false;
    const range=[...highlights][0];
    const rect=range.getBoundingClientRect();
    const canvas=document.querySelector('.react-flow').getBoundingClientRect();
    return document.querySelector('.react-flow__viewport').style.transform.endsWith('scale(1)') && range.toString()==='गुणत्वम्' && Math.abs((rect.y+rect.height/2)-(canvas.y+canvas.height/2))<80;
  });
  await page.waitForFunction(()=>document.querySelector('.react-flow__viewport').style.transform.endsWith('scale(1)'));
  assert.match(await page.$eval('.react-flow__viewport',el=>el.style.transform), /scale\(1\)/);
  assert.equal(await page.$eval('[data-id="table-search"]',el=>el.querySelectorAll('mark').length),0,'search does not modify saved rich text');
  await page.screenshot({path:'.tmp/search-word-highlight.png'});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>CSS.highlights.has('board-search-match')),false);
  await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
  await page.locator('[aria-label="Search board"]').fill('needle');
  await page.click('[role="dialog"] button::-p-text(needle)');
  await page.waitForFunction(()=>{
    const range=[...(CSS.highlights.get('board-search-match')??[])][0];
    if (!range || range.toString()!=='needle') return false;
    const rect=range.getBoundingClientRect();
    const canvas=document.querySelector('.react-flow').getBoundingClientRect();
    return Math.abs(rect.y+rect.height/2-canvas.y-canvas.height/2)<80;
  });
  assert.deepEqual(errors,[]);
  console.log('PASS: Search highlights a formatted Sanskrit word deep in a large table, centers it at 100%, and clears with Escape');
} finally { await browser.close(); }
