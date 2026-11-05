import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3095';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();page.on("pageerror",e=>console.log(e.message));page.on("console",m=>{if(m.type()==="error")console.log(m.text());});
try {
 await page.setViewport({width:1600,height:1000});await page.goto(base);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=180;const x=c.getContext('2d');x.fillStyle='orange';x.fillRect(0,0,300,180);return c.toDataURL().split(',')[1];});
 const folder=path.resolve('.tmp/folder-import-fixture');await fs.mkdir(folder,{recursive:true});
 for(const name of ['page10.png','page2.png','page1.png'])await fs.writeFile(path.join(folder,name),Buffer.from(png,'base64'));
 await fs.writeFile(path.join(folder,'notes.txt'),'Ignore me');await fs.writeFile(path.join(folder,'broken.png'),'Invalid image');
 await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-folder-images',title:'Folder images',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});});db.close();});
 await page.goto(base+'/app/boards/guest-folder-images',{waitUntil:'networkidle0'});
 await page.waitForSelector('[aria-label="Import image folder with notes"]',{timeout:5000});
 const input=await page.$('input[aria-label="Image folder"]');await input.uploadFile(folder);
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-image').length===3);
 await new Promise(r=>setTimeout(r,600));await page.click('[aria-label="Fit board"]');await new Promise(r=>setTimeout(r,600));
 const rows=await page.$$eval('.react-flow__node-image',nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {name:n.querySelector('img').alt,x:r.x,y:r.y,width:r.width,height:r.height};}).sort((a,b)=>a.y-b.y));
 assert.deepEqual(rows.map(r=>r.name),['page1.png','page2.png','page10.png']);
 assert.ok(rows[1].y>rows[0].y+rows[0].height && rows[2].y>rows[1].y+rows[1].height,'images do not overlap');
 const notes=await page.$$eval('.react-flow__node-shape',nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}).sort((a,b)=>a.y-b.y));
 assert.equal(notes.length,3);for(let i=0;i<3;i++){assert.ok(notes[i].x>rows[i].x+rows[i].width);assert.ok(Math.abs(notes[i].y-rows[i].y)<2);}

 const snapshot=()=>page.$$eval('.react-flow__node',nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.dataset.id,type:n.className,x:r.x,y:r.y,width:r.width,height:r.height};}));
 const original=await snapshot(),imageIds=original.filter(n=>n.type.includes('node-image')).sort((a,b)=>a.y-b.y).map(n=>n.id),noteIds=original.filter(n=>n.type.includes('node-shape')).sort((a,b)=>a.y-b.y).map(n=>n.id);
 const bounds=async id=>page.$eval(`.react-flow__node[data-id="${id}"]`,n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 const dragHandle=async(id,dx,dy)=>{
   let r=await bounds(id);await page.mouse.click(r.x+12,r.y+12);
   const handle=await page.$(`.react-flow__node[data-id="${id}"] .react-flow__resize-control.bottom.right.handle`);assert.ok(handle);
   const h=await handle.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+dx,h.y+h.height/2+dy,{steps:15});await page.mouse.up();await new Promise(r=>setTimeout(r,350));
 };
 const beforeImage=await bounds(imageIds[1]),beforeNote=await bounds(noteIds[0]);
 await dragHandle(noteIds[0],0,180);
 const tallNote=await bounds(noteIds[0]),movedImage=await bounds(imageIds[1]);
 assert.ok(tallNote.height>beforeNote.height+150);
 assert.ok(Math.abs(movedImage.y-beforeImage.y-(tallNote.height-beforeNote.height))<3,'tall note makes room below');
 assert.ok(Math.abs((await bounds(imageIds[0])).height-rows[0].height)<2,'image height unchanged');
 await page.click('button[title^="Undo"]');await new Promise(r=>setTimeout(r,300));assert.ok(Math.abs((await bounds(imageIds[1])).y-beforeImage.y)<3);
 await page.click('button[title^="Redo"]');await new Promise(r=>setTimeout(r,300));
 let r=await bounds(noteIds[0]);await page.mouse.click(r.x+12,r.y+12);
 const props=await page.$('[aria-label="Object properties"]');if(props)await props.click();
 const add=await page.$('button::-p-text(Add note column)');assert.ok(add);await add.click();
 await new Promise(r=>setTimeout(r,700));
 await page.mouse.click(100,150);await page.click('[aria-label="Fit board"]');await new Promise(r=>setTimeout(r,600));
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===7);
 const withColumn=await snapshot(),newNote=withColumn.find(n=>!original.some(o=>o.id===n.id));assert.ok(newNote);
 const first=await bounds(noteIds[0]);assert.ok(newNote.x>first.x+first.width);
 const secondBefore=await bounds(newNote.id),firstBefore=await bounds(noteIds[0]);
 await dragHandle(noteIds[0],100,0);
 const firstAfter=await bounds(noteIds[0]),secondAfter=await bounds(newNote.id);
 assert.ok(Math.abs(secondAfter.x-secondBefore.x-(firstAfter.width-firstBefore.width))<3,'widening a note pushes its next column');
 // Added columns grow down as their content grows and move following image rows.
 r=await bounds(newNote.id);await page.mouse.click(r.x+12,r.y+12);await new Promise(r=>setTimeout(r,200));
 await page.$eval(`.react-flow__node[data-id="${newNote.id}"] .group`,el=>el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
 await page.waitForSelector('[contenteditable="true"]');
 await page.type('[contenteditable="true"]',Array.from({length:32},(_,i)=>`Additional note ${i+1}`).join('\n'));
 await page.mouse.click(100,150);await new Promise(r=>setTimeout(r,700));
 await page.click('[aria-label="Fit board"]');await new Promise(r=>setTimeout(r,600));
 const grown=await bounds(newNote.id),nextImage=await bounds(imageIds[1]);
 assert.ok(nextImage.y>grown.y+grown.height,'text growth leaves next image below the tallest note');
 assert.ok(await page.$eval(`.react-flow__node[data-id="${newNote.id}"] .ProseMirror`,n=>n.scrollHeight<=n.clientHeight+1),'all note lines fit without clipping');
 await page.screenshot({path:'.tmp/expanded-image-notes.png'});
 await new Promise(r=>setTimeout(r,1700));await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===7);
 assert.ok(await page.$eval(`.react-flow__node[data-id="${newNote.id}"]`,n=>n.textContent.includes('Additional note 32')));
 console.log('PASS taller note row reflow, unchanged image size, resize undo/redo, add note column, horizontal column spacing, text growth and persistence');
} finally {await browser.close();}
