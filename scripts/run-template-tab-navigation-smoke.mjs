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

 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.waitForSelector('details[aria-label="Row 1"]');
 assert.equal(await page.$eval('details[aria-label="Row 1"]',e=>e.open),false);
 await page.click('details[aria-label="Row 1"] > summary');
 await page.waitForSelector('details[aria-label="Row 1"] [role=textbox][aria-label=Answer]');

 await page.focus('details[aria-label="Row 1"] [role=textbox][aria-label=Answer]');
 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Last part');
 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>document.activeElement?.textContent==='Repeat after');
 await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Last part');
 assert.equal(await page.$eval('details[aria-label="Row 1"] [aria-label="Last part"]',e=>e.textContent),'');
 await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Answer'&&document.activeElement.closest('details')?.getAttribute('aria-label')==='Row 1 repeat 1');
 assert.equal(await page.$$eval('.react-flow__node',nodes=>nodes.length),1);
 console.log('PASS: Tab moves through parts to Repeat after; Shift+Tab returns; Enter repeats and focuses first part; no text tabs or new canvas objects');
} finally {await browser.close();}
