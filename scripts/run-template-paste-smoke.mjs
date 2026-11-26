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
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{columns:[{id:'col',name:'Target'}],rows:[{id:'row',cells:['']}]},text:'Open documentation',href:'https://example.com/docs',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});

 await page.waitForSelector('[data-cell-row="row"][data-cell-column="col"]');
 await page.click('[data-cell-row="row"][data-cell-column="col"]');
 await page.evaluate(()=>{
   window.getSelection()?.removeAllRanges();
   const dt=new DataTransfer();
   dt.setData('application/x-manojalam-template-values',JSON.stringify({
     template:{id:'paste',name:'Paste',rows:[{id:'r',indent:0,textAlign:'left',fields:[{id:'answer',label:'Answer',kind:'link',color:'#ff99cc',fontSize:32}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}},
     sections:[{id:'one',values:{answer:{text:'Pasted heading',href:'https://example.com'}},extraRows:[]}]
   }));
   document.querySelector('[data-cell-row="row"][data-cell-column="col"] [data-row]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
 });
 await page.waitForFunction(()=>document.querySelector('[data-cell-row="row"][data-cell-column="col"]')?.textContent.includes('Pasted heading'));
 const result=await page.$eval('[data-cell-row="row"][data-cell-column="col"]',cell=>({
 count:cell.textContent.split('Pasted heading').length-1,
 textareas:cell.querySelectorAll('textarea').length,
 html:cell.innerHTML
 }));
 assert.equal(result.count,1);
 assert.equal(result.textareas,0);
 assert.match(result.html,/rgb\(255, 153, 204\)/);
 assert.match(result.html,/https:\/\/example.com/);
 console.log('PASS: template paste renders once, keeps color and link, no plain-text duplicate');
} finally {await browser.close();}
