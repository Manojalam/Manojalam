import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3093';
const browser=await puppeteer.launch({executablePath:process.env.BOARD_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();page.on('dialog',dialog=>dialog.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
const button=async name=>{const h=await page.waitForFunction(name=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===name&&el.getBoundingClientRect().width),{},name);await h.asElement().click()};
const tools=async()=>{const tab=await page.waitForFunction(()=>[...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent==='Table'));await tab.asElement().click();await page.$eval('summary',()=>{});await page.$$eval('summary',els=>els.filter(el=>el.textContent==='Convert layout').forEach(el=>{if(!el.parentElement.open)el.click()}));};
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
 await page.click('[aria-label="Row 1, A"]');await tools();await button('Stack into one column');
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===6);
 assert.deepEqual(await page.$$eval('tbody td',els=>els.map(el=>el.querySelector('textarea')?.value??el.querySelector('.ProseMirror')?.textContent??'')),['a1','b1','c1','a2','b2','c2']);
 assert.equal(await page.$$eval('tbody [aria-label^="Template text"]',els=>els.length),1);
 assert.match(await page.$eval('tbody tr:nth-child(2)',el=>el.textContent),/भवति/);
 assert.ok(await page.$('tbody tr:nth-child(2) strong'));
 // One undo restores the whole layout and template mapping.
 await page.mouse.click(1300,800);await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===2);
 assert.deepEqual(await page.$$eval('thead .ProseMirror',els=>els.map(el=>el.textContent)),['A','B','C']);
 await page.click('[aria-label="Row 1, A"]');await tools();await button('Transpose rows / columns');
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===3);
 assert.deepEqual(await page.$$eval('tbody td',els=>els.map(el=>el.querySelector('textarea')?.value??el.querySelector('.ProseMirror')?.textContent??'')),['a1','a2','b1','b2','c1','c2']);
 assert.deepEqual(await page.$$eval('tbody th .ProseMirror',els=>els.map(el=>el.textContent)),['A','B','C']);
 await tools();await page.select('[aria-label="Reshape reading order"]','columns');await page.locator('[aria-label="Reshape column count"]').fill('1');await button('Reshape');
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===6);
 assert.deepEqual(await page.$$eval('tbody td',els=>els.map(el=>el.querySelector('textarea')?.value??el.querySelector('.ProseMirror')?.textContent??'')),['a1','b1','c1','a2','b2','c2']);
 await new Promise(r=>setTimeout(r,2200));await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.$$eval('tbody tr',els=>els.length),6);
 assert.equal(await page.$$eval('tbody [data-template-toggle]',els=>els.length),1);
 assert.match(await page.$eval('tbody tr:nth-child(2)',el=>el.textContent),/भू \+ तिप्/);
 assert.deepEqual(errors,[]);await page.screenshot({path:'.tmp/table-convert.png'});
 console.log('PASS stack, transpose, reading order, undo, template styling/collapse, and reload');
}catch(e){await page.screenshot({path:'.tmp/table-convert-failure.png'});throw e}finally{await browser.close()}
