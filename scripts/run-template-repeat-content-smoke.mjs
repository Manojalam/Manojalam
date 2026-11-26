import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'fixed',label:'Fixed',kind:'constant',constantText:'Constant label',constantAlways:true},{id:'answer',label:'Answer',kind:'link',color:'#ffffff'}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation',href:'https://example.com/docs'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',newLine:true,values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'shape',position:{x:150,y:150},style:{width:400,height:300},data:{text:'Open documentation',href:'https://example.com/docs',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});
 await page.click('[data-id="object"]');
 await page.waitForFunction(()=>document.activeElement?.matches('[data-id=object] [contenteditable=true]'));

 await page.evaluate(()=>{const el=document.querySelector('[data-id=object] [contenteditable=true] [data-field-label=fixed]');const r=document.createRange();r.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);});
 await page.keyboard.type('Constant label edited: ');
 await page.evaluate(()=>{const el=document.querySelector('[data-id=object] [contenteditable=true] p');const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);});
 await page.keyboard.type(' extra authored text');
 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.waitForSelector('details[aria-label="Row 1"]');
 assert.equal(await page.$eval('details[aria-label="Row 1"]',e=>e.open),false);
 await page.click('details[aria-label="Row 1"] > summary');
 await page.$eval('details[aria-label="Row 1"]',e=>[...e.querySelectorAll('button')].find(b=>b.textContent==='Repeat after').click());
 await page.waitForFunction(()=>document.activeElement?.matches('[contenteditable=true]') && document.activeElement.closest('details')?.getAttribute('aria-label')?.includes('repeat'));
 assert.equal(await page.$eval('details[aria-label="Row 1"]',e=>e.open),false);

 const repeat='details[aria-label="Row 1 repeat 1"]';
 const original='details[aria-label="Row 1"]';
 const value=selector=>page.$eval(selector+' [role=textbox][aria-label=Answer]',e=>e.textContent);
 assert.ok((await value(repeat)).startsWith('Open documentation'));

 const copied=await page.$eval('[data-id=object]',e=>e.textContent);
 assert.equal(copied.split('extra authored text').length-1,2);
 assert.equal(copied.split('Constant label edited:').length-1,2);
 await page.$eval(repeat,e=>[...e.querySelectorAll('button')].find(b=>b.textContent==='Repeat after').click());
 await page.waitForFunction(()=>document.querySelector('[data-id=object]')?.textContent.split('extra authored text').length===4);
 assert.equal(await page.$eval('[data-id=object]',e=>e.textContent.split('Constant label edited:').length-1),3);
 console.log('PASS: repeat preserves full visible content and edited constants; copying a repeat also preserves them');
} finally {await browser.close();}
