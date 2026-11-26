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
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{columns:[{id:'col',name:'Target'},{id:'other',name:'Other'}],rows:[{id:'row',cells:['','Beta'],templates:{col:{template,sections,independent:true}}},{id:'row2',cells:['Gamma','Delta']}]},text:'Open documentation',href:'https://example.com/docs'}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});



 const cell='[data-cell-row="row"][data-cell-column="col"]';
 const other='[data-cell-row="row"][data-cell-column="other"]';
 await page.click(cell);
 await page.locator('button[role="tab"]::-p-text(Text)').click();
 await page.waitForSelector('[aria-label="Selected text controls"] [title="Underline"]',{visible:true});
 assert.equal(await page.$eval('button[role=tab][aria-selected=true]',e=>e.textContent),'Text');
 for(const title of ['Bold','Italic','Underline','Strikethrough','Superscript','Subscript']) {
   assert.ok(await page.$('[aria-label="Selected text controls"] [title="'+title+'"]'),title+' is available');
 }
 await page.waitForFunction(sel=>document.activeElement?.matches(sel+' [contenteditable=true]'),{},cell);
 await page.locator('[aria-label="Selected text controls"] [title="Bold"]').click();
 await page.waitForFunction(sel=>document.querySelector(sel+' strong')?.textContent.includes('Open documentation'),{},cell);
 assert.equal(await page.$eval(other,e=>!!e.querySelector('strong')),false);
 await page.click(cell+' [contenteditable=true]');
 await page.keyboard.down('Control');await page.keyboard.press('Home');await page.keyboard.up('Control');
 await page.keyboard.down('Shift');await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.locator('[aria-label="Selected text controls"] [title="Underline"]').click();
 await page.waitForFunction(sel=>document.querySelector(sel+' u')?.textContent==='O',{},cell);
 assert.equal(await page.$eval(other,e=>!!e.querySelector('u')),false);
 console.log('PASS: full Text toolbar for template cells; unselected formatting stays in cell; highlighted text formats independently');
} finally {await browser.close();}
