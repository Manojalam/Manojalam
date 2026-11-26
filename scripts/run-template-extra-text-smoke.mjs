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
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{columns:[{id:'col',name:'Target'}],rows:[{id:'row',cells:['Old duplicate below'],richCells:{col:'<p>Old duplicate below</p>'},templates:{col:{template,sections,independent:true}}}]},text:'Open documentation',href:'https://example.com/docs'}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});


 await page.waitForSelector('[data-cell-row="row"] textarea');
 await page.click('[data-cell-row="row"] textarea');
 await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA');
 await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');
 await page.keyboard.type('Editable extra text');
 assert.equal(await page.$eval('[data-cell-row="row"] textarea',e=>e.value),'Editable extra text');
 await page.locator('button::-p-text(Remove extra text below template)').click();
 await page.waitForFunction(()=>!document.querySelector('[data-cell-row="row"] textarea'));
 assert.ok(await page.$eval('[data-cell-row="row"]',e=>e.textContent.includes('Open documentation')));
 await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');
 await page.waitForSelector('[data-cell-row="row"] textarea');
 assert.equal(await page.$eval('[data-cell-row="row"] textarea',e=>e.value),'Editable extra text');
 await page.click('[data-cell-row="row"] textarea');
 await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.press('Backspace');
 await page.waitForFunction(()=>!document.querySelector('[data-cell-row="row"] textarea'));
 console.log('PASS: extra text retains focus, edits, removes independently, supports Undo and keyboard deletion');
} finally {await browser.close();}
