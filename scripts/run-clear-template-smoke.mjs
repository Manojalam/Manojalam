import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage();
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'answer',label:'Answer',kind:'text',color:'#ffffff'}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Keep for undo'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'shape',position:{x:150,y:150},style:{width:400,height:300},data:{text:'Keep for undo',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});
 await page.click('.react-flow__node[data-id="object"]');
 await page.click('[aria-label="Object properties"]');
 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.locator('button::-p-text(Clear template values)').click();
 await page.waitForFunction(()=>!document.querySelector('.react-flow__node[data-id="object"]').textContent.includes('Keep for undo'));
 await page.click('button[title^="Undo"]');
 await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="object"]').textContent.includes('Keep for undo'));
 await page.locator('button::-p-text(Clear template values)').click();
 await new Promise(r=>setTimeout(r,1600));await page.reload({waitUntil:'networkidle0'});
 assert.ok(!(await page.$eval('.react-flow__node[data-id="object"]',e=>e.textContent)).includes('Keep for undo'));
 console.log('PASS clear values, undo restoration and persisted cleared object.');
} finally {await browser.close();}

