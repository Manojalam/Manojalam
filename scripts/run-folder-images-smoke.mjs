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
 await page.click('button[title^="Undo"]');await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===0);
 await page.click('button[title^="Redo"]');await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===6);
 const bounds=async selector=>page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 const drag=async(r,dx,dy)=>{await page.mouse.move(r.x+12,r.y+12);await page.mouse.down();await page.mouse.move(r.x+12+dx,r.y+12+dy,{steps:12});await page.mouse.up();await new Promise(r=>setTimeout(r,200));};
 const imageBefore=await bounds('.react-flow__node-image'), noteBefore=await bounds('.react-flow__node-shape');
 await drag(imageBefore,-35,-25);
 const imageAfter=await bounds('.react-flow__node-image'), noteAfter=await bounds('.react-flow__node-shape');
 assert.ok(Math.abs(imageAfter.x-imageBefore.x)>10);
 assert.ok(Math.abs(noteAfter.x-noteBefore.x-(imageAfter.x-imageBefore.x))<2 && Math.abs(noteAfter.y-noteBefore.y-(imageAfter.y-imageBefore.y))<2,'note follows image');
 assert.equal(await page.$$eval('.react-flow__node.selected',e=>e.length),1,'image selection stays individual');
 await drag(noteAfter,35,25);
 const imageAfterNote=await bounds('.react-flow__node-image'), noteAfterNote=await bounds('.react-flow__node-shape');
 assert.ok(Math.abs(noteAfterNote.x-noteAfter.x)>10);
 assert.ok(Math.abs(imageAfterNote.x-imageAfter.x-(noteAfterNote.x-noteAfter.x))<2 && Math.abs(imageAfterNote.y-imageAfter.y-(noteAfterNote.y-noteAfter.y))<2,'image follows note');
 assert.equal(await page.$$eval('.react-flow__node.selected',e=>e.length),1,'note selection stays individual');
 await page.click('.react-flow__node-shape');await new Promise(r=>setTimeout(r,200));await page.$eval('.react-flow__node-shape .group',e=>e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));await page.screenshot({path:'.tmp/folder-edit.png'});
 await page.waitForSelector('[contenteditable="true"]');await page.$eval('[contenteditable="true"]',e=>e.focus());await page.keyboard.type('My notes alongside page one');await new Promise(r=>setTimeout(r,600));await page.mouse.click(1400,900);
 await new Promise(r=>setTimeout(r,1700));await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-image').length===3);
 await page.waitForFunction(()=>document.querySelector('.react-flow__viewport')?.textContent.includes('My notes alongside page one'),{timeout:5000});
 console.log('PASS bidirectional paired dragging with separate selection/editing, folder picker, natural filename ordering, vertical spacing, side-by-side editable notes, undo/redo and reload.');
} catch(error) { console.log(await page.url(), (await page.$eval("body", e=>e.innerText)).slice(0,1800));throw error; } finally {await browser.close();}

