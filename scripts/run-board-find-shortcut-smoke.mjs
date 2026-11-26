import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000); page.on("dialog", dialog=>dialog.accept());
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'answer',label:'Answer',kind:'sutra',color:'#ffffff'}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation',href:'https://example.com/docs'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'shape',position:{x:150,y:150},style:{width:400,height:300},data:{text:'Open documentation',href:'https://example.com/docs',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;const request=tx.objectStore('boards').get('guest-clear-template');request.onsuccess=()=>{const b=request.result;b.id='guest-find-table';b.content.nodes=[{id:'object',type:'table',position:{x:100,y:100},data:{table:{columns:[{id:'col',name:'Column'}],rows:[{id:'row',cells:['Cell text'],templates:{col:{template,sections,independent:true}}}]}}}];tx.objectStore('boards').put(b);};});db.close();
 });

 const find=async()=>{await page.keyboard.down('Control');await page.keyboard.press('f');await page.keyboard.up('Control');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Search board');assert.ok(await page.$('[role=search]'));await page.keyboard.press('Escape');};
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-id="object"]');
 await page.click('[data-id="object"]');await page.waitForFunction(()=>document.activeElement?.matches('[data-id=object] [contenteditable=true]'));
 await find();
 await page.locator('button[role="tab"]::-p-text(Template)').click();
 await page.click('details[aria-label="Row 1"] > summary');
 await page.focus('details[aria-label="Row 1"] [role=textbox]');await find();
 await page.focus('details[aria-label="Row 1"] input[role=combobox]');await find();
 await page.goto(base+'/app/boards/guest-find-table',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-cell-row="row"] [data-row]');
 await page.focus('[data-cell-row="row"] [data-row]');
 await page.locator('button[role="tab"]::-p-text(Text)').click();
 await page.focus('[data-cell-row="row"] [contenteditable=true]');await find();
 await page.focus('[data-cell-row="row"] textarea');await find();
 console.log('PASS: Ctrl+F opens focused board search from shape, template value, sutra lookup, table editor and textarea across two boards');
} finally {await browser.close();}
