import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'group',label:'Parts',kind:'multipart',color:'#ffffff',parts:[{id:'answer',label:'Answer',kind:'sutra',color:'#ffffff'},{id:'last',label:'Last part',kind:'text',color:'#ffffff'}]}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'shape',position:{x:150,y:150},style:{width:400,height:300},data:{text:'Open documentation',href:'https://example.com/docs',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});
 await page.click('[data-id="object"]');
 await page.waitForFunction(()=>document.activeElement?.matches('[data-id=object] [contenteditable=true]'));


 await page.locator('button[role="tab"]::-p-text(Text)').click();
 await new Promise(r=>setTimeout(r,400));
 await page.evaluate(()=>{
 const mark=Array.from(document.querySelectorAll('[data-id="object"] [data-field-instance]')).find(e=>JSON.parse(e.dataset.fieldInstance)[1]==='rep');
 const range=document.createRange();range.setStart(mark.firstChild,0);range.setEnd(mark.firstChild,mark.textContent.length);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 });
 await new Promise(r=>setTimeout(r,150));
 assert.equal(await page.$eval('button[role="tab"][aria-selected="true"]',e=>e.textContent),'Text');
 assert.equal(await page.evaluate(()=>window.getSelection().isCollapsed),true);
 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.waitForFunction(()=>document.querySelector('details[aria-label="Row 1 repeat 1"]')?.open);
 assert.equal(await page.$eval('details[aria-label="Row 1 repeat 1"] [data-template-input-field="answer"]',e=>e.classList.contains('ring-2')),true);
 assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('details')),false);
 assert.ok(await page.$('details[aria-label="Row 1 repeat 1"] input'));
 console.log('PASS: Selection retains Text tab and canvas text; opening Template reveals matching repeated row and field without stealing focus');
} finally {await browser.close();}
