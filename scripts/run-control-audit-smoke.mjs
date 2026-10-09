import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3093';
const browser=await puppeteer.launch({executablePath:process.env.BOARD_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const types=['shape','text','sticky','table','sanskrit','shloka','grammar','frame','audio','junction','sunburst','relationshipDiagram','mindmap'];
const inventories={};
try {
 await page.setViewport({width:1600,height:1000});await page.goto(base);
 await page.evaluate(async types=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;
   for(const type of types)tx.objectStore('boards').put({id:'guest-audit-'+type,title:type,storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type,position:{x:160,y:180},style:{width:360,height:250},data:{text:'Audit text',label:'Audit',title:'Audit',devanagari:'\u092d\u0935\u0924\u093f',shloka:'\u092d\u0935\u0924\u093f',translation:'Test',shapeType:'rounded',table:{columns:[{id:'a',name:'A'},{id:'b',name:'B'}],rows:[{id:'row',cells:['one','two']}]}}}],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});
  });db.close();
 },types);
 for(const type of process.env.AUDIT_STATES_ONLY ? [] : types){
  await page.goto(base+'/app/boards/guest-audit-'+type,{waitUntil:'networkidle0'});
  await page.waitForSelector('.react-flow__node[data-id="object"]');
  await page.$eval('.react-flow__node[data-id="object"]',el=>el.click());
  await page.click('[aria-label="Object properties"]');
  await page.waitForSelector('[data-properties-header]');
  const tabs=await page.$$eval('[data-properties-header] [role=tab]',els=>els.map(el=>el.textContent));
  inventories[type]={tabs,controls:{}};
  for(const tab of tabs){
   await page.$$eval('[data-properties-header] [role=tab]',(els,tab)=>els.find(el=>el.textContent===tab).click(),tab);
   await new Promise(r=>setTimeout(r,80));
   await page.$$eval('#board-properties details',els=>els.forEach(el=>el.open=true));
   inventories[type].controls[tab]=await page.$$eval('#board-properties button,#board-properties input,#board-properties select,#board-properties summary',els=>els.filter(el=>el.getBoundingClientRect().height>0).map(el=>el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent.trim()).filter(Boolean));
  }
  assert.ok(tabs.includes('Arrange')&&tabs.includes('More'),type);
  if(!['audio','junction'].includes(type))assert.ok(tabs.includes('Style')&&tabs.includes('Text'),type+' common text/style');
  assert.ok(inventories[type].controls.More.includes('Clear content'),type+' clear');
  console.log('Audited '+type+': '+tabs.join(', '));
 }
 // Selection states which previously lost contextual/shared controls.
 await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
  const node=(id,type,data,x,y)=>({id,type,position:{x,y},style:{width:180,height:80},data:{text:id,...data}});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;
   tx.objectStore('boards').put({id:'guest-audit-states',title:'Selection states',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[node('parent','text',{},80,180),node('first','text',{},360,180),node('second','text',{},360,340),node('audio','audio',{},80,500),node('matrixA','shape',{matrixCell:true},650,180),node('matrixB','shape',{matrixCell:true},650,340)],edges:[{id:'first-edge',source:'parent',target:'first'},{id:'second-edge',source:'parent',target:'second'}],settings:{},viewport:{x:0,y:0,zoom:1}}});
   tx.objectStore('boards').put({id:'guest-audit-library',title:'Library source',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[],edges:[],settings:{sampleTemplates:[{id:'appearance',name:'Imported appearance',richText:'<p>Sample</p>',labels:[],style:{fillColor:'#ff0000'},width:200,height:100}],styleTemplates:[{id:'shared',name:'Imported shared style',style:{fillColor:'#00ff00'},roles:[],sample:{type:'shape',text:'Style',richText:'<p>Style</p>',width:200,height:100}}]}}});
  });db.close();
 });
 const choose=async name=>{const el=await page.waitForFunction(name=>[...document.querySelectorAll('[data-properties-header] [role=tab]')].find(el=>el.textContent===name),{},name);await el.asElement().click();};
 await page.goto(base+'/app/boards/guest-audit-states',{waitUntil:'networkidle0'});
 await page.$eval('.react-flow__node[data-id="first"]',el=>el.click());await page.click('[aria-label="Object properties"]');
 await choose('Arrange');await page.waitForSelector('#board-properties [aria-label="Child order"]');
 await page.click('[aria-label="Move child later"]');
 assert.match(await page.$eval('[aria-label="Child order"]',el=>el.textContent),/2 of 2/);
 await new Promise(resolve=>setTimeout(resolve,350));
 // Selection on an audio object plus a connection must keep connection text/style.
 await page.$eval('.react-flow__node[data-id="audio"]',el=>el.click());
 await page.keyboard.down('Shift');await page.$eval('.react-flow__edge[data-id="first-edge"]',el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true})));await page.keyboard.up('Shift');
 await choose('Style');assert.match(await page.$eval('#board-properties',el=>el.innerText),/Connection appearance/i);
 await choose('Text');assert.match(await page.$eval('#board-properties',el=>el.innerText),/Label/i);
 await page.$eval('.react-flow__edge[data-id="first-edge"]',el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true})));
 await page.waitForFunction(()=>!document.querySelector('.react-flow__edge[data-id="first-edge"]').classList.contains('selected'));

 await page.$eval('.react-flow__node[data-id="matrixA"]',el=>el.click());
 await page.keyboard.down('Shift');await page.$eval('.react-flow__node[data-id="matrixB"]',el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true})));await page.keyboard.up('Shift');
 await choose('Matrix');assert.match(await page.$eval('#board-properties',el=>el.innerText),/Matrix cell minimum size/i);
 await page.$eval('.react-flow__node[data-id="parent"]',el=>el.click());await choose('Style');
 await page.$$eval('#board-properties details',els=>els.forEach(el=>el.open=true));
 await page.waitForFunction(()=>document.querySelector('#board-properties').textContent.includes('Imported appearance')&&document.querySelector('#board-properties').textContent.includes('Imported shared style'));
 await page.setViewport({width:600,height:750});
 assert.equal(await page.$eval('#board-properties .canvas-inspector-panel',el=>getComputedStyle(el).maxHeight),'none');
 console.log('PASS free-form child reorder, mixed audio/connection controls, matrix multiselection, cross-board style libraries, narrow inspector height');
 assert.deepEqual(errors,[]);
 mkdirSync('.tmp',{recursive:true});writeFileSync('.tmp/control-audit.json',JSON.stringify(inventories,null,2));
 if(!process.env.AUDIT_STATES_ONLY)console.log('PASS all 13 registered object types have reachable tabs and editing actions');
} finally {await browser.close()}

