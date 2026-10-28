import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3094';
const browser = await puppeteer.launch({executablePath: process.env.BOARD_TEST_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await fs.mkdir('.tmp',{recursive:true});
try {
 await page.setViewport({width:1500,height:950});await page.goto(base);
 const png=await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-images',title:'Image attachment test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'target',type:'shape',position:{x:150,y:150},style:{width:220,height:120},data:{text:'Attach here',shapeType:'rounded'}}],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});});db.close();
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle='#fa8231';c.fillRect(0,0,96,64);c.fillStyle='#152a52';c.fillRect(10,10,30,30);return canvas.toDataURL('image/png').split(',')[1];
 });
 await fs.writeFile('.tmp/attachment-test.png',Buffer.from(png,'base64'));
 await page.goto(base+'/app/boards/guest-images',{waitUntil:'networkidle0'});
 const chooserPromise=page.waitForFileChooser();await page.click('[aria-label="Add image to board"]');const chooser=await chooserPromise;await chooser.accept(['.tmp/attachment-test.png']);
 await page.waitForSelector('.react-flow__node-image img');
 assert.equal(await page.$eval('.react-flow__node-image img',el=>el.naturalWidth),96);
 await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');
 await page.waitForFunction(()=>!document.querySelector('.react-flow__node-image'));
 await page.keyboard.down('Control');await page.keyboard.down('Shift');await page.keyboard.press('z');await page.keyboard.up('Shift');await page.keyboard.up('Control');
 await page.waitForSelector('.react-flow__node-image img');
 // Exercise the real browser clipboard and keyboard shortcut, not a synthetic paste event.
 await browser.defaultBrowserContext().overridePermissions(base, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
 await page.evaluate(async png => {
   const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
   await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([bytes],{type:'image/png'})})]);
 },png);
 await page.click('.react-flow__pane',{offset:{x:450,y:150}});
 await page.keyboard.down('Control');await page.keyboard.press('v');await page.keyboard.up('Control');
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-image img').length===2);
 await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-image img').length===1);
 await page.keyboard.down('Control');await page.keyboard.down('Shift');await page.keyboard.press('z');await page.keyboard.up('Shift');await page.keyboard.up('Control');
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-image img').length===2);
 await page.click('.react-flow__node[data-id="target"]');
 await page.click('[aria-label="Object properties"]');
 const trigger='[data-properties-header] [aria-label="Add image or audio"]';await page.waitForSelector(trigger);await page.click(trigger);
 const add=await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Add image'));
 const chooseAttachment=page.waitForFileChooser();await add.asElement().click();await (await chooseAttachment).accept(['.tmp/attachment-test.png']);
 await page.waitForSelector('[data-node-media-layer="target"] img');
 await page.keyboard.press('Escape');
 await new Promise(resolve=>setTimeout(resolve,1500));
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForSelector('.react-flow__node-image img');await page.waitForSelector('[data-node-media-layer="target"] img');
 assert.equal(await page.$$eval('.react-flow__node-image img',els=>els.length),2);
 assert.equal(await page.$eval('.react-flow__node[data-id="target"]',el=>el.textContent.includes('Attach here')),true);
 await page.click('.react-flow__node[data-id="target"]');
 await page.click('[role="tab"][aria-controls="properties-text"]');
 assert.ok(await page.$( '[data-properties-header] [aria-label="Manage 1 media attachments"]'));
 await page.click('[aria-label="Lock selected objects"]');
 assert.equal(await page.$eval('[data-properties-header] [aria-label="Manage 1 media attachments"]',el=>el.disabled),true);
 await page.click('[aria-label="Unlock selected objects"]');
 await page.screenshot({path:'.tmp/image-attachments.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: board image picker/rendering, native Ctrl+V image paste, undo/redo, visible element attachment picker, original text retained, both persist after reload.');
} finally {await browser.close();}

