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
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{showRowLabels:true,columns:[{id:'col',name:'Target'},{id:'other',name:'Other'}],rows:[{id:'row',label:'Row label',minHeight:250,cells:['Alpha','Beta']},{id:'row2',cells:['Gamma','Delta']}]},text:'Open documentation',href:'https://example.com/docs'}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});



 const label='[data-cell-row="row"][data-cell-column="$row-label"]';
 const other='[data-cell-row="row"][data-cell-column="col"]';
 await page.click(label);
 await page.waitForSelector(label+' [contenteditable=true]');
 await page.locator('button[role="tab"]::-p-text(Text)').click();
 await page.waitForSelector('[data-universal-text-tools="inspector"] [aria-label="First-line indent (em)"]');
 await page.click('[aria-label="Align text middle"]');
 assert.equal(await page.$eval(label,e=>getComputedStyle(e).verticalAlign),'middle');
 assert.equal(await page.$eval(other,e=>getComputedStyle(e).verticalAlign),'top');
 const offset=await page.$eval(label,e=>{const p=e.querySelector('p').getBoundingClientRect(),c=e.getBoundingClientRect();return Math.abs((p.top+p.bottom)/2-(c.top+c.bottom)/2);});
 assert.ok(offset<15,'label must visibly sit in the middle of its cell');
 assert.ok(await page.$('[data-universal-text-tools="inspector"] [aria-label="Tab width (spaces)"]'));
 await page.click('[aria-label="Align text bottom"]');
 assert.equal(await page.$eval(label,e=>getComputedStyle(e).verticalAlign),'bottom');
 await page.click('[aria-label="Align text middle"]');
 await new Promise(r=>setTimeout(r,1800));
 page.on('dialog',d=>d.accept());await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.$eval(label,e=>getComputedStyle(e).verticalAlign),'middle');
 assert.equal(await page.$eval(other,e=>getComputedStyle(e).verticalAlign),'top');
 await page.click(label);
 await page.locator('button[role="tab"]::-p-text(Text)').click();
 const indent='[data-universal-text-tools="inspector"] [aria-label="First-line indent (em)"]';
 await page.waitForSelector(indent);await page.click(indent,{clickCount:3});await page.keyboard.type('2');await page.keyboard.press('Enter');
 await page.waitForFunction(sel=>document.querySelector(sel+' p')?.style.textIndent==='2em',{},label);
 assert.notEqual(await page.$eval(other+' p',e=>e.style.textIndent),'2em');
 console.log('PASS: shared text controls include indents and vertical alignment; row label centers visibly; neighboring cells unchanged; alignment persists after reload');
} finally {await browser.close();}
