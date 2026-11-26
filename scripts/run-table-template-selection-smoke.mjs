import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'answer',label:'Answer',kind:'link',color:'#ffffff'}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation',href:'https://example.com/docs'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{columns:[{id:'col',name:'Target'}],rows:[{id:'other',cells:['Other extra text'],templates:{col:{template,sections:[{id:'other-section',values:{answer:{text:'Other cell'}},extraRows:[]}],independent:true}}},{id:'blank',cells:['Plain cell']},{id:'row',cells:['Old duplicate below'],richCells:{col:'<p>Old duplicate below</p>'},templates:{col:{template,sections,independent:true}}}]},text:'Open documentation',href:'https://example.com/docs'}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});




 await page.focus('[data-cell-row="row"] [data-row]');
 await page.locator('button[role="tab"]::-p-text(Text)').click();
 await page.evaluate(()=>{
 const mark=Array.from(document.querySelectorAll('[data-cell-row="row"] [data-field-instance]')).find(e=>JSON.parse(e.dataset.fieldInstance)[0]==='two');
 const range=document.createRange();range.selectNodeContents(mark);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 });
 await new Promise(r=>setTimeout(r,150));
 assert.equal(await page.$eval('button[role=tab][aria-selected=true]',e=>e.textContent),'Text');
 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.waitForFunction(()=>document.querySelector('select[aria-label="Section to fill"]')?.value==='two'&&document.querySelector('details[aria-label="Row 1"]')?.open);
 assert.equal(await page.$eval('details[aria-label="Row 1"] [role=textbox]',e=>e.textContent),'Second section');
 console.log('PASS: table selection reveals correct cell and section without switching tabs');
} finally {await browser.close();}
