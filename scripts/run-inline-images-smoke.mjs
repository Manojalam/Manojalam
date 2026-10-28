import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3095';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const rect=async selector=>page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
const drag=async(x,y,dx,dy)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:15});await page.mouse.up();await new Promise(r=>setTimeout(r,250));};
const key=async redo=>{await page.keyboard.down('Control');if(redo)await page.keyboard.down('Shift');await page.keyboard.press('z');if(redo)await page.keyboard.up('Shift');await page.keyboard.up('Control');};
try {
 await page.setViewport({width:1600,height:1000});await page.goto(base);
 await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=300;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#fef3c7';ctx.fillRect(0,0,300,160);ctx.fillStyle='#172554';ctx.font='28px sans-serif';ctx.fillText('Inside the box',25,85);
  const image={id:'legacy',kind:'image',name:'Screenshot.png',mimeType:'image/png',dataUrl:c.toDataURL(),size:100,createdAt:new Date().toISOString(),width:300,height:160};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-inline-image',title:'Inline images',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'box',type:'shape',position:{x:150,y:150},style:{width:500,height:320},data:{shapeType:'rounded',text:'',autoSizeMode:'fixed',userSize:{width:500,height:320},mediaAttachments:[image]}},{id:'standalone',type:'image',position:{x:800,y:150},style:{width:240,height:128},data:{image}}],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-inline-image',{waitUntil:'networkidle0'});
 const inline='[data-inline-image="legacy"]';await page.waitForSelector(inline+' img');
 const box=await rect('.react-flow__node[data-id="box"]');const initial=await rect(inline);
 assert.ok(initial.width>box.width*.5,'legacy image is full content, not a corner thumbnail');
 assert.ok(initial.x>=box.x&&initial.y>=box.y&&initial.x+initial.width<=box.x+box.width+1&&initial.y+initial.height<=box.y+box.height+1);
 await page.click(inline+' img');await page.waitForSelector('[data-image-resize]');
 await drag(initial.x+initial.width/2,initial.y+initial.height/2,-25,-20);
 let moved=await rect(inline);assert.ok(moved.x<initial.x-20&&moved.y<initial.y-15);
 let handle=await rect('[data-image-resize]');await drag(handle.x+8,handle.y+8,-65,-35);
 const resized=await rect(inline);assert.ok(resized.width<moved.width-40,'resize handle changes image size');
 assert.ok(Math.abs(resized.width/resized.height-300/160)<.02,'resize preserves image ratio');
 await key(false);await page.waitForFunction(w=>Math.abs(document.querySelector('[data-inline-image]').getBoundingClientRect().width-w)<2,{},moved.width);
 await key(true);await page.waitForFunction(w=>Math.abs(document.querySelector('[data-inline-image]').getBoundingClientRect().width-w)<2,{},resized.width);
 await drag(box.x+12,box.y+12,40,30);
 const followed=await rect(inline);const movedBox=await rect('.react-flow__node[data-id="box"]');assert.ok(movedBox.x>box.x+20);assert.ok(Math.abs(followed.x-resized.x-(movedBox.x-box.x))<3&&Math.abs(followed.y-resized.y-(movedBox.y-box.y))<3,'image follows parent');
 await page.click('.react-flow__node[data-id="standalone"] img');
 const resize='.react-flow__node[data-id="standalone"] .react-flow__resize-control.bottom.right.handle';await page.waitForSelector(resize);
 const before=await rect('.react-flow__node[data-id="standalone"]');handle=await rect(resize);await drag(handle.x+handle.width/2,handle.y+handle.height/2,60,32);
 const after=await rect('.react-flow__node[data-id="standalone"]');assert.ok(after.width>before.width+40,'standalone image has working resize handles');
 await new Promise(r=>setTimeout(r,1500));await page.reload({waitUntil:'networkidle0'});await page.waitForSelector(inline);
 const persisted=await rect(inline);assert.ok(Math.abs(persisted.width-resized.width)<2);assert.ok(Math.abs(persisted.x-followed.x)<2);
 await page.click(inline+' img');await page.click('[aria-label="Object properties"]');await page.click('[aria-label="Lock selected objects"]');
 assert.equal(await page.$('[data-image-resize]'),null,'locked attachments have no edit controls');
 await page.click('[aria-label="Unlock selected objects"]');await page.click(inline+' img');
 await fs.mkdir('.tmp',{recursive:true});await page.screenshot({path:'.tmp/inline-images.png'});
 assert.deepEqual(errors,[]);console.log('PASS legacy images inside box, drag, aspect-preserving resize, undo/redo, parent movement, reload persistence, locked state and standalone resize handles.');
} catch(e){await fs.mkdir('.tmp',{recursive:true});await page.screenshot({path:'.tmp/inline-image-failure.png'});throw e;}finally{await browser.close();}


