import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3096';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();
page.on('dialog',d=>d.accept());
try {
 await page.goto(base);
 await page.evaluate(async()=>{
 const req=indexedDB.open('manojalam-guest-boards',1);req.onupgradeneeded=()=>req.result.createObjectStore('boards',{keyPath:'id'});
 const db=await new Promise(r=>req.onsuccess=()=>r(req.result));
 await new Promise(r=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=r;tx.objectStore('boards').put({id:'guest-fast-save',title:'Fast save',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{version:1,nodes:[],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-fast-save',{waitUntil:'networkidle0'});
 await page.waitForSelector('[aria-label="Board title"]');
 for(let i=0;i<3;i++){
 await page.focus('[aria-label="Board title"]');
 await page.keyboard.press('End');await page.keyboard.type('X');
 // Force the save while the 200ms local backup debounce is still pending.
 await page.evaluate(()=>window.dispatchEvent(new Event('vidya:retry-save')));
 await new Promise(r=>setTimeout(r,800));
 const backup=await page.evaluate(async()=>{const req=indexedDB.open('manojalam-board-recovery',1);const db=await new Promise(r=>req.onsuccess=()=>r(req.result));const read=db.transaction('backups').objectStore('backups').get('guest:guest-fast-save');const b=await new Promise(r=>read.onsuccess=()=>r(read.result));db.close();return b;});
 assert.equal(backup.pending,false,'successful save must not leave a late pending backup');
 assert.equal(backup.board.title,'Fast save'+'X'.repeat(i+1));
 }
 await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.$eval('[aria-label="Board title"]',e=>e.value),'Fast saveXXX');
 assert.equal(await page.$('button::-p-text(Retry save)'),null);
 console.log('PASS: immediate saves drain delayed backups; acknowledged revision remains current; reload does not show false recovery');
}finally{await browser.close();}
