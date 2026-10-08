import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3093';
const browser=await puppeteer.launch({executablePath:process.env.BOARD_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const button=async name=>{const h=await page.waitForFunction(name=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===name&&el.getBoundingClientRect().width),{},name);await h.asElement().click()};
const tools=async()=>{await page.$eval('summary',()=>{});await page.$$eval('summary',els=>els.filter(el=>el.textContent==='Convert layout').forEach(el=>{if(!el.parentElement.open)el.click()}));};
try{
 await page.setViewport({width:1800,height:1100});await page.goto(base);
 await page.evaluate(async()=>{
  const template={id:'t',name:'Prakriya',style:{fontSize:22,lineSpacing:1.5,width:400,textColor:'#333333',fillColor:'',borderColor:''},rows:[{id:'form',indent:0,collapsible:true,fields:[{id:'form',label:'Form',kind:'text',color:'#be185d'}]},{id:'steps',indent:0,collapseParentId:'form',fields:[{id:'steps',label:'Steps',kind:'text',color:'#2563eb'}]}]};
  const card={template,independent:true,sections:[{id:'first',values:{form:{text:'भवति',richText:'<strong>भवति</strong>'},steps:{text:'भू + तिप्'}},extraRows:[]}]};
  const table={columns:['A','B','C'].map(id=>({id,name:id})),rows:[{id:'one',cells:['a1','b1','c1'],templates:{B:card}},{id:'two',cells:['a2','b2','c2']}]};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-convert',title:'Table conversion',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:80,y:200},style:{width:900,height:240},data:{table}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
 });
 await page.goto(base+'/app/boards/guest-convert',{waitUntil:'networkidle0'});

 await page.click('[aria-label="Row 1, A"]');
 await page.click('[aria-label="Object properties"]');
 await button('Text');
 assert.equal(await page.$$eval('#board-properties button',els=>els.filter(el=>el.textContent.trim()==='Text').length),1,'Text has no nested expander');
 for(const title of ['Left','Center','Right','Justify','Bold','Italic']) assert.ok(await page.$(`#board-properties button[title="${title}"]`),title);
 assert.ok(await page.$('#board-properties [aria-label="Line spacing"]'));
 assert.equal(await page.$$eval('[aria-label="Font for selected objects"]',els=>els.length),0,'No duplicate font strip');
 await page.click('#board-properties button[title="Center"]');
 assert.equal(await page.$eval('[aria-label="Row 1, A"]',el=>getComputedStyle(el).textAlign),'center');
 await button('Style');await button('Fill');await button('Border');
 await button('Size');await button('Dimensions');
 assert.ok(await page.$('[aria-label="Selected item width"]'));
 // Select template text, then open Properties and Text without losing the range.
 await page.click('[aria-label="Template text, B"]');
 await page.waitForSelector('[aria-label="Template text, B"] .ProseMirror[contenteditable=true]');
 const wordPoint=await page.$eval('[aria-label="Template text, B"] .ProseMirror',editor=>{
  const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){if(text.textContent.includes('भवति'))break;}
  const range=document.createRange();range.selectNodeContents(text);const box=range.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};
 });
 await page.mouse.click(wordPoint.x,wordPoint.y,{count:2});
 await new Promise(r=>setTimeout(r,150));
 await page.click('[aria-label="Object properties"]');await button('Text');
 assert.equal(await page.evaluate(()=>window.getSelection().toString()),'भवति');
 await page.click('#board-properties button[title="Underline"]');
 await page.waitForFunction(()=>document.querySelector('[aria-label="Template text, B"] .ProseMirror u'));

 await page.click('#board-properties button[title="Right"]');
 await page.waitForFunction(()=>document.querySelector('[aria-label="Template text, B"] .ProseMirror p')?.style.textAlign==='right');
 assert.equal(await page.evaluate(()=>window.getSelection().toString()),'भवति');
 assert.ok(await page.$('[data-template-accessory]'));
 assert.ok(await page.$('#board-properties [aria-label="Selected text controls"]'));
 assert.deepEqual(errors,[]);await page.screenshot({path:'.tmp/inspector-controls.png'});
 console.log('PASS direct Text controls, no duplicates, table alignment, Style/Size, preserved template selection and inline underline/alignment');
}catch(e){await page.screenshot({path:'.tmp/inspector-controls-failure.png'});throw e}finally{await browser.close()}
