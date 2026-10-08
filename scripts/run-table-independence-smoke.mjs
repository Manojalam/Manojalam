import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3093';
const browser=await puppeteer.launch({executablePath:process.env.BOARD_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.setViewport({width:1800,height:1100});await page.goto(base);
 const source=readFileSync('src/lib/canvas/template-value-html.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 await page.addScriptTag({content:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const ordering=await page.evaluate(()=>{
   const span=(key,text)=>`<span data-field-instance="${key}">${text}</span>`;
   const base=`<p>${span('dhatu','भू')}</p>`;
   const local=`<p><strong>${span('dhatu','भू')}</strong></p>`;
   const next=`<p>${span('dhatu','भू')}${span('plus',' + ')}${span('pratyaya','लट्')}${span('open',' [ ')}${span('sutra','<a href="https://example.com">सूत्र</a>')}${span('close',' ]')}</p>`;
   const result=refreshEditedTemplate(local,base,next);
   const body=new DOMParser().parseFromString(result,'text/html').body;
   return {text:body.textContent,keys:[...body.querySelectorAll('[data-field-instance]')].map(s=>s.dataset.fieldInstance),bold:body.querySelector('strong')?.textContent,link:body.querySelector('a')?.textContent};
 });
 assert.deepEqual(ordering,{text:'भू + लट् [ सूत्र ]',keys:['dhatu','plus','pratyaya','open','sutra','close'],bold:'भू',link:'सूत्र'});
 await page.evaluate(async()=>{
  const template={id:'t',name:'Prakriya',style:{fontSize:22,lineSpacing:1.5,width:400,textColor:'#333333',fillColor:'',borderColor:''},rows:[{id:'form',indent:0,collapsible:true,fields:[{id:'form',label:'Form',kind:'text',color:'#be185d'}]},{id:'steps',indent:0,collapseParentId:'form',fields:[{id:'steps',label:'Steps',kind:'text',color:'#2563eb'}]}]};
  const card={template,independent:true,sections:[{id:'first',values:{form:{text:'भवति',richText:'<strong>भवति</strong>'},steps:{text:'भू + लट् [ वर्तमान में लट् ]\nभू + तिप् [ तिप्तस्झिसिप्थस्थमिब्वस्मस् ]'}},extraRows:[]}]};
  const table={columns:['A','B','C'].map(id=>({id,name:id})),rows:[{id:'one',cells:['','',''],templates:{A:card}},{id:'two',cells:['a2','b2','c2']}]};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-convert',title:'Table conversion',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:80,y:200},style:{width:900,height:240},data:{table}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
 });

 await page.goto(base+'/app/boards/guest-convert',{waitUntil:'networkidle0'});
 await page.click('[aria-label="Template text, A"]');
 await page.waitForSelector('[aria-label="Template text, A"] [contenteditable=true]');
 for(const [column,text] of [['B','Plain second'],['C','Plain third']]){
   const selector=`[data-cell-row="one"][data-cell-column="${column}"]`;
   const point=await page.$eval(selector,el=>{const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.bottom-12}});
   await page.mouse.click(point.x,point.y);
   await page.waitForFunction(column=>document.activeElement?.matches('[contenteditable=true]')&&document.activeElement.closest('[data-cell-column]')?.dataset.cellColumn===column,{},column);
   await page.keyboard.type(text);
   assert.equal(await page.$eval(selector+' .ProseMirror',el=>el.textContent),text);
   assert.equal(await page.$eval(selector,el=>el.dataset.cellSelected),'true');
   assert.equal(await page.$('[data-template-accessory]'),null,'Plain cells do not enter template filling');
   await page.click('[aria-label="Template text, A"]');
   await page.waitForSelector('[aria-label="Template text, A"] [contenteditable=true]');
 }
 await page.click('[aria-label="Object properties"]');
 const summary=await page.$('[data-template-accessory] > summary');await summary.click();
 assert.equal(await page.$eval('[data-template-accessory]',el=>el.open),false);
 assert.ok(await page.$('#board-properties [aria-label="Object properties tabs"]'));
 await summary.click();
 const size=()=>page.$eval('[data-cell-column="A"][data-cell-row="one"]',el=>({width:el.offsetWidth,height:el.offsetHeight}));
 const before=await size();
 assert.equal(await page.$eval('[data-template-toggle]',el=>el.textContent),'−');
 await page.click('[data-template-toggle]');
 await page.waitForFunction(()=>document.querySelector('[data-template-toggle]')?.textContent==='+');
 await page.waitForFunction(before=>{const el=document.querySelector('[data-cell-column="A"][data-cell-row="one"]');return el.offsetWidth<before.width&&el.offsetHeight<before.height},{},before);
 const collapsed=await size();await page.click('[data-template-toggle]');
 await page.waitForFunction(collapsed=>{const el=document.querySelector('[data-cell-column="A"][data-cell-row="one"]');return el.offsetWidth>collapsed.width&&el.offsetHeight>collapsed.height},{},collapsed);
 await page.mouse.click(1300,900);await new Promise(r=>setTimeout(r,2200));await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.$eval('[data-cell-row="one"][data-cell-column="B"] .ProseMirror',el=>el.textContent),'Plain second');
 assert.equal(await page.$eval('[data-cell-row="one"][data-cell-column="C"] .ProseMirror',el=>el.textContent),'Plain third');
 assert.equal(await page.$$eval('[aria-label^="Template text"]',els=>els.length),1);
 await page.click('[aria-label="Row 1, C"]');
 await page.click('button[aria-label="Templates"]');
 const useTemplate=await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Use in selected cell'&&el.getBoundingClientRect().width));
 assert.equal(await useTemplate.asElement().evaluate(el=>el.disabled),false,'Plain cells can explicitly opt into a template');
 assert.deepEqual(errors,[]);console.log('PASS multipart insertion order, mixed-cell typing, active highlight, collapsible panel, plus/minus sizing and reload');
}catch(error){await page.screenshot({path:'.tmp/table-independence-failure.png'});throw error}finally{await browser.close()}
