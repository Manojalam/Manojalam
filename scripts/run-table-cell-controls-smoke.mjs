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
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{columns:[{id:'col',name:'Target'},{id:'other',name:'Other'}],rows:[{id:'row',cells:['Alpha','Beta']},{id:'row2',cells:['Gamma','Delta']}]},text:'Open documentation',href:'https://example.com/docs'}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});


 const cell='[data-cell-row="row"][data-cell-column="col"]';
 const other='[data-cell-row="row"][data-cell-column="other"]';
 await page.click(cell);
 await page.waitForSelector(cell+' [contenteditable=true]');
 await page.waitForFunction(sel=>document.activeElement?.matches(sel+' [contenteditable=true]'),{},cell);
 await page.keyboard.press('Home');await page.keyboard.down('Shift');await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Clear selected content')?.click());
 await page.waitForFunction(sel=>!document.querySelector(sel)?.textContent.includes('Alpha'),{},cell);
 assert.ok(await page.$eval(cell,e=>e.textContent.includes('lpha')), 'clear removes only the highlighted A');
 await page.locator('button[role="tab"]::-p-text(Table)').click();
 await page.locator('button::-p-text(Clear selected content)').click();
 await page.waitForFunction(sel=>!document.querySelector(sel)?.textContent.includes('lpha'),{},cell);
 assert.ok(await page.$eval(other,e=>e.textContent.includes('Beta')));
 await page.click(other);
 await page.locator('button[role="tab"]::-p-text(Table)').click();
 await page.locator('[aria-label="Align selected cells right"]').click();
 await page.waitForFunction(sel=>document.querySelector(sel+' p')?.style.textAlign==='right',{},other);
 assert.notEqual(await page.$eval(cell+' p',e=>e.style.textAlign),'right');
 await page.click(other+' [contenteditable=true]');
 await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');
 await page.evaluate(sel=>{
 const dt=new DataTransfer();dt.setData('text/html','<p data-template-row="copy" style="text-align:left"><span data-field-owner="card:sample" style="color:#ff0000;font-size:28px">Styled copy</span></p>');
 dt.setData('text/plain','Styled copy');
 document.querySelector(sel+' [contenteditable=true]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
 },other);
 await page.waitForFunction(sel=>document.querySelector(sel)?.textContent.includes('Styled copy'),{},other);
 assert.match(await page.$eval(other,e=>e.innerHTML),/rgb\(255, 0, 0\)/);
 await page.locator('button[role="tab"]::-p-text(Table)').click();
 const height=await page.locator('[aria-label="Row minimum height"]').waitHandle();
 await height.click({clickCount:3});await page.keyboard.type('180');await page.keyboard.press('Tab');
 await page.waitForFunction(()=>document.querySelector('[data-cell-row="row"]')?.parentElement.style.height==='180px');
 await page.locator('button::-p-text(Auto-fit row)').click();
 await page.waitForFunction(()=>document.querySelector('[data-cell-row="row"]')?.parentElement.style.height==='');
 console.log('PASS: scoped clear, cell alignment, formatted template text paste, row height and auto fit');
} finally {await browser.close();}
