import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();
const base=process.env.BOARD_TEST_URL??'http://localhost:3096';
try {
 await page.setViewport({width:1500,height:1000});await page.goto(base);
 await page.evaluate(async()=>{
  const req=indexedDB.open('manojalam-guest-boards',1);req.onupgradeneeded=()=>req.result.createObjectStore('boards',{keyPath:'id'});
  const db=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result));
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-shape-tool',title:'Shapes',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-shape-tool',{waitUntil:'networkidle0'});
 await page.click('button[aria-label="Choose shape"]');await page.click('button[aria-label="Diamond"]');
 assert.equal(await page.$eval('button[aria-label="Draw Diamond"]',e=>e.getAttribute('aria-pressed')),'true');
 await page.mouse.click(400,300);await page.waitForSelector('.react-flow__node-shape');
 await page.keyboard.press('Escape');
 await page.click('button[aria-label="Draw Diamond"]');
 assert.equal(await page.$('button[aria-label="Diamond"]'),null);
 await page.mouse.click(700,450);
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-shape').length===2);
 await new Promise(r=>setTimeout(r,2300));
 const types=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});const board=await new Promise(resolve=>{const r=db.transaction('boards').objectStore('boards').get('guest-shape-tool');r.onsuccess=()=>resolve(r.result)});db.close();return board.content.nodes.map(n=>n.data.shapeType)});
 assert.deepEqual(types,['diamond','diamond']);
 await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('button[aria-label="Draw Diamond"]');
 await page.click('button[aria-label="Choose shape"]');await page.waitForSelector('button[aria-label="Diamond"]');
 console.log('PASS: arrow opens picker, main icon reuses Diamond without reopening picker, both created shapes are diamonds, choice survives reload');
} finally {await browser.close();}
