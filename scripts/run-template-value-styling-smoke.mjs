import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'group',label:'Parts',kind:'multipart',color:'#ffffff',parts:[{id:'answer',label:'Answer',kind:'text',color:'#ffffff'},{id:'last',label:'Last part',kind:'text',color:'#ffffff'}]}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'shape',position:{x:150,y:150},style:{width:400,height:300},data:{text:'Open documentation',href:'https://example.com/docs',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});
 await page.click('[data-id="object"]');
 await page.waitForFunction(()=>document.activeElement?.matches('[data-id=object] [contenteditable=true]'));



 await new Promise(r=>setTimeout(r,400));
 await page.evaluate(()=>{const mark=document.querySelector('[data-id="object"] [data-field-instance]');const r=document.createRange();r.selectNodeContents(mark);r.collapse(false);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);});await page.keyboard.type('xyz',{delay:100});await new Promise(r=>setTimeout(r,2400));

 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.waitForSelector('details[aria-label="Row 1"] [contenteditable=true]');
 const hasReset=()=>page.$$eval('button',els=>els.some(e=>e.textContent==='Use template styling'));
 assert.equal(await hasReset(),false,'typing directly in object must not create a style override');
 const field='details[aria-label="Row 1"] [data-template-input-field="answer"] [contenteditable=true]';
 await page.click(field);await page.keyboard.press('End');await page.keyboard.type('q');
 await new Promise(r=>setTimeout(r,200));assert.equal(await hasReset(),false,'typing in template field must not create a style override');
 await page.keyboard.down('Control');await page.keyboard.press('b');await page.keyboard.up('Control');await page.keyboard.type('B');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Use template styling'));
 const before=await page.$eval(field,e=>e.textContent);
 await page.locator('button::-p-text(Use template styling)').click();
 assert.equal(await page.$eval(field,e=>e.textContent),before,'reset styling preserves words');
 console.log('PASS: object and panel word edits stay unstyled; deliberate bold shows reset; reset preserves text');
} finally {await browser.close();}
