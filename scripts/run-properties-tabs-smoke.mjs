import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3093';
const browser=await puppeteer.launch({executablePath:process.env.BOARD_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
const tab=async label=>{const handle=await page.waitForFunction(label=>[...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent===label),{},label);await handle.asElement().click()};
try{
 await page.setViewport({width:1600,height:950});await page.goto(base);
 await page.evaluate(async()=>{
  const template={id:'t',name:'Prakriya',style:{fontSize:22,lineSpacing:1.5,width:400,textColor:'#333333',fillColor:'',borderColor:''},rows:[{id:'form',indent:0,collapsible:true,fields:[{id:'form',label:'Form',kind:'text',color:'#be185d'}]},{id:'steps',indent:0,collapseParentId:'form',fields:[{id:'steps',label:'Steps',kind:'text',color:'#2563eb'}]}]};
  const card={template,independent:true,sections:[{id:'first',values:{form:{text:'भवति',richText:'<strong>भवति</strong>'},steps:{text:'भू + तिप्'}},extraRows:[]}]};
  const table={columns:['A','B','C'].map(id=>({id,name:id})),rows:[{id:'one',cells:['a1','b1','c1'],templates:{B:card}},{id:'two',cells:['a2','b2','c2']}]};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-convert',title:'Table conversion',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:80,y:200},style:{width:900,height:240},data:{table}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
 });

 await page.goto(base+'/app/boards/guest-convert',{waitUntil:'networkidle0'});
 await page.click('[aria-label="Template text, B"]');
 await page.waitForSelector('#properties-template');
 await tab('Template');
 const layout=await page.evaluate(()=>{
   const header=document.querySelector('[data-properties-header]').getBoundingClientRect();
   const content=document.querySelector('#properties-template').getBoundingClientRect();
   return {header:header.height,content:content.height,bottom:content.bottom,viewport:innerHeight};
 });
 assert.ok(layout.content>550,JSON.stringify(layout));assert.ok(layout.bottom<=layout.viewport+1);
 assert.equal(await page.$$eval('#board-properties [role="tablist"]',els=>els.length),1);
 assert.equal(await page.$$eval('#board-properties [aria-label="Object properties tabs"]',els=>els.filter(el=>el.getBoundingClientRect().height).length),0);
 await page.screenshot({path:'.tmp/properties-template-tabs.png'});
 await tab('Table');await page.waitForSelector('#properties-table-tools [aria-label="Table tools"]');
 assert.ok(await page.$eval('#properties-table-tools',el=>el.getBoundingClientRect().height>100));
 assert.ok(await page.$eval('#properties-table-tools',el=>el.scrollWidth<=el.clientWidth+1),'Table controls fit the sidebar');
 assert.equal(await page.$$eval('.react-flow__node [aria-label="Table tools"]',els=>els.length),0,'Table controls leave the canvas');
 await tab('Style');assert.equal(await page.$eval('#properties-table-tools',el=>el.getBoundingClientRect().height),0);
 assert.equal(await page.$$eval('#board-properties h3',els=>els.filter(el=>el.getBoundingClientRect().height&&el.textContent==='table').length),0);
 await tab('Template');
 await page.click('[aria-label="Template text, B"]');
 await page.waitForSelector('[aria-label="Template text, B"] .ProseMirror[contenteditable=true]');
 await page.evaluate(()=>{
  const editor=document.querySelector('[aria-label="Template text, B"] .ProseMirror');editor.focus();const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode())if(text.textContent.includes('भवति'))break;
  const range=document.createRange();range.selectNodeContents(text);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);document.dispatchEvent(new Event('selectionchange'));
 });
 await tab('Text');await page.waitForSelector('#board-properties [title="Underline"]');await page.click('#board-properties [title="Underline"]');
 assert.equal(await page.evaluate(()=>getSelection().toString()),'भवति');
 await tab('Template');assert.ok(await page.$eval('#properties-template',el=>el.getBoundingClientRect().height>550));
 await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-matrix-tabs',title:'Matrix',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'matrix',type:'shape',position:{x:100,y:200},style:{width:400,height:200},data:{text:'Matrix',layoutMode:'matrix'}}],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}})});db.close();
 });
 await page.goto(base+'/app/boards/guest-matrix-tabs',{waitUntil:'networkidle0'});
 await page.$eval('.react-flow__node',el=>el.click());await page.click('[aria-label="Object properties"]');
 await tab('Matrix');assert.match(await page.$eval('#board-properties',el=>el.innerText),/Matrix table/i);
 await tab('Template');assert.ok(await page.$('#properties-template [aria-label="Templates"]'));
 await page.setViewport({width:900,height:750});
 const compact=await page.$eval('#properties-template',el=>el.getBoundingClientRect().height);assert.ok(compact>500,String(compact));
 assert.deepEqual(errors,[]);console.log('PASS fixed shared tabs, full-height template, table-specific tools and retained inline selection');
}catch(e){await page.screenshot({path:'.tmp/properties-tabs-failure.png'}).catch(()=>{});throw e}finally{await browser.close()}
