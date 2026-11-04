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
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-inline-image',title:'Inline images',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'box',type:'shape',position:{x:150,y:150},style:{width:500,height:320},data:{shapeType:'rounded',text:'',autoSizeMode:'fixed',userSize:{width:500,height:320},mediaAttachments:[image]}},{id:'standalone',type:'image',position:{x:800,y:150},style:{width:600,height:128},data:{image}}],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-inline-image',{waitUntil:'networkidle0'});
 const inline='[data-inline-image="legacy"]';await page.waitForSelector(inline+' img');
 await page.waitForFunction(()=>Math.abs(document.querySelector('.react-flow__node[data-id="standalone"]').getBoundingClientRect().width-240)<2);

 const clickNoteAction=async()=>{
   const buttons=await page.$$('button');
   for(const button of buttons) if((await button.evaluate(n=>n.textContent)).trim()==='Add linked note'){await button.click();return;}
   throw new Error('Add linked note missing');
 };
 const closeEditor=async()=>{await page.mouse.click(1100,800);await new Promise(r=>setTimeout(r,300));};
 await page.click(inline+' img');await clickNoteAction();
 await page.waitForSelector('.react-flow__node-text');
 assert.ok(await page.$(inline),'creating note retains inline attachment');
 await page.waitForSelector('[contenteditable="true"]');await page.type('[contenteditable="true"]','Image-specific notes');await closeEditor();
 const noteSelector='.react-flow__node-text';
 const noteBefore=await rect(noteSelector), imageBefore=await rect(inline), ownerBefore=await rect('.react-flow__node[data-id="box"]');
 await drag(imageBefore.x+imageBefore.width/2,imageBefore.y+imageBefore.height/2,-25,-20);
 const noteMoved=await rect(noteSelector),imageMoved=await rect(inline);
 assert.ok(Math.abs(noteMoved.x-noteBefore.x-(imageMoved.x-imageBefore.x))<3 && Math.abs(noteMoved.y-noteBefore.y-(imageMoved.y-imageBefore.y))<3,'inline image carries its linked note');
 assert.deepEqual(await rect('.react-flow__node[data-id="box"]'),ownerBefore);
 await drag(ownerBefore.x+12,ownerBefore.y+12,25,25);
 const noteWithOwner=await rect(noteSelector);assert.ok(Math.abs(noteWithOwner.x-noteMoved.x-((await rect('.react-flow__node[data-id="box"]')).x-ownerBefore.x))<3,'parent carries image note once');
 await page.click(inline+' img');
 assert.equal(await page.$$eval('[data-inline-image] button',bs=>bs.some(b=>b.textContent==='Edit linked note')),true);
 const current=await rect(inline);
 await drag(current.x+current.width/2,current.y+current.height/2,0,450);
 await page.waitForFunction(()=>!document.querySelector('[data-inline-image]'));
 const detached=await page.$eval('.react-flow__node-image:not([data-id="standalone"])',n=>n.dataset.id);
 const detachedRect=await rect(`.react-flow__node[data-id="${detached}"]`),detachedNote=await rect(noteSelector);
 await drag(detachedRect.x+12,detachedRect.y+12,30,0);
 assert.ok(Math.abs((await rect(noteSelector)).x-detachedNote.x-((await rect(`.react-flow__node[data-id="${detached}"]`)).x-detachedRect.x))<3,'link survives detachment');
 await page.click('.react-flow__node[data-id="standalone"] img');
 const properties=await page.$('[aria-label="Object properties"]');if(properties)await properties.click();
 await clickNoteAction();
 await new Promise(r=>setTimeout(r,650));await closeEditor();await page.click('[aria-label="Fit board"]');await new Promise(r=>setTimeout(r,500));
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-text').length===2);
 await closeEditor();
 await page.click('button[title^="Undo"]');await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-text').length===1);
 await page.click('button[title^="Redo"]');await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-text').length===2);
 await new Promise(r=>setTimeout(r,1800));await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-text').length===2);
 assert.ok(await page.$$eval('.react-flow__node-text',ns=>ns.some(n=>n.textContent.includes('Image-specific notes'))));
 assert.deepEqual(errors,[]);
 console.log('PASS linked notes for attached and standalone images, image and owner movement, detachment, editing and reload');
} finally {await browser.close();}
