import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'answer',label:'Answer',kind:'sutra',color:'#ffffff'}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation',href:'https://example.com/docs'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
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

 const search='details[aria-label="Row 1"] input[role=combobox]';
 await page.focus(search);await page.keyboard.type('3.4.');
 await page.waitForSelector('[role=option]');
 const first=await page.$eval('[role=option]',e=>e.id);
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.id),first);
 await page.keyboard.press('Tab');
 assert.notEqual(await page.evaluate(()=>document.activeElement.id),first);
 await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
 assert.equal(await page.evaluate(()=>document.activeElement.id),first);
 const selected=await page.$eval('[role=option]',e=>e.textContent.trim().split(/\s+/)[0]);
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='textbox'&&document.activeElement.getAttribute('aria-label')==='Answer');
 assert.equal(await page.$('[role=listbox]'),null);
 assert.ok(await page.$eval('details[aria-label="Row 1"] [role=textbox]',e=>e.innerHTML.includes('ashtadhyayi.com')));
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Answer link');
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Repeat after');
 await page.focus(search);await page.keyboard.type('3.4.');await page.waitForSelector('[role=option]');
 await page.keyboard.press('Tab');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('role')),'combobox');
 assert.equal(await page.$('[role=listbox]'),null);
 console.log('PASS: Tab/Shift+Tab select sutra results; Enter appends and focuses value; Tab continues to link/repeat; Escape dismisses results');
} finally {await browser.close();}
