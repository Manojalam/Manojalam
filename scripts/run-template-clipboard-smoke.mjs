import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless:true});
const page = await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const cell = n => `[data-row="r0"][data-column="c${n}"][role="group"]`;
try {
  await page.setViewport({width:1800,height:1050});
  await page.goto(base);
  await page.evaluate(async()=>{
    const template={id:'prakriya',name:'Prakriya',rows:[{id:'form',indent:0,collapsible:true,collapsedByDefault:true,fields:[{id:'form',label:'Form',kind:'text',color:'#be185d'}]},{id:'steps',indent:1,collapseParentId:'form',fields:[{id:'steps',label:'Steps',kind:'multiline',color:'#2563eb'}]}],style:{fillColor:'',borderColor:'',textColor:'#111111',fontSize:22,lineSpacing:1.5,width:600}};
    const sections=[{id:'first',values:{form:{text:'भवति'},steps:{text:'भू + तिप्\nभू + शप् + ति'}},extraRows:[]},{id:'second',values:{form:{text:'भवतः'},steps:{text:'भू + तस्'}},extraRows:[]}];
    const table={columns:[{id:'c0',name:'एकवचनम्'},{id:'c1',name:'द्विवचनम्'},{id:'c2',name:'बहुवचनम्'}],rows:[{id:'r0',cells:['','',''],templates:{c0:{template,sections,independent:true},c1:{template,sections:[{id:"empty",values:{},extraRows:[]}],independent:true}}}]};
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-collapse',title:'Collapse rows',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:60,y:160},style:{width:900,height:362},data:{table,tableMinHeight:362}},{id:"shape",type:"shape",position:{x:1050,y:160},style:{width:300,height:180},data:{shapeType:"rounded",fillColor:"#ffcc00",text:"destination"}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-collapse',{waitUntil:'networkidle0'});

  const source = cell(0);
  const target = cell(1);
  await page.waitForSelector(source);
  // Exercise the same native clipboard events emitted by Ctrl+C / Ctrl+V.
  await page.$eval(source, el => { el.focus(); window.getSelection().removeAllRanges(); const data = new DataTransfer(); el.dispatchEvent(new ClipboardEvent('copy', {clipboardData:data,bubbles:true,cancelable:true})); window.testClipboard = data; });
  assert.ok(await page.evaluate(() => window.testClipboard.getData('application/x-manojalam-template-values')));
  await page.$eval(target, el => { el.focus(); window.getSelection().removeAllRanges(); el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:window.testClipboard,bubbles:true,cancelable:true})); });
  await new Promise(resolve=>setTimeout(resolve,2200));
  const saved = await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
    const board=await new Promise(resolve=>{const r=db.transaction('boards').objectStore('boards').get('guest-collapse');r.onsuccess=()=>resolve(r.result)});db.close(); return board.content.nodes[0].data.table.rows[0].templates;
 });
 assert.deepEqual(saved.c0.sections,saved.c1.sections);
 // Highlighted text must stay on the native text path, without template metadata.
 await page.click(source, {clickCount:2});
 await page.waitForSelector(source+' [contenteditable=true]');
 await page.$eval(source+' [contenteditable=true]',el=>{ const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range); const data=new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));window.textCopy=data.getData('application/x-manojalam-template-values'); });
 assert.equal(await page.evaluate(()=>window.textCopy),'');
 // Real keyboard shortcuts: a selected cell into an ordinary shape.
 await page.$eval(source, el=>{ document.activeElement?.blur();window.getSelection().removeAllRanges();el.focus(); });
 await page.keyboard.down('Control');await page.keyboard.press('c');await page.keyboard.up('Control');
 await page.click('.react-flow__node[data-id="shape"]');
 await page.evaluate(()=>{document.activeElement?.blur();window.getSelection().removeAllRanges();});
 await page.keyboard.down('Control');await page.keyboard.press('v');await page.keyboard.up('Control');
 await new Promise(resolve=>setTimeout(resolve,2200));
 const shape = await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
    const board=await new Promise(resolve=>{const r=db.transaction('boards').objectStore('boards').get('guest-collapse');r.onsuccess=()=>resolve(r.result)});db.close(); return board.content.nodes.find(n=>n.id==='shape');
 });
 assert.equal(shape.data.cardTemplateId,'prakriya');
 assert.equal(shape.data.fillColor,'#ffcc00');
 assert.deepEqual(shape.data.cardSections,saved.c0.sections);
 await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');
 await new Promise(resolve=>setTimeout(resolve,300));
 assert.match(await page.$eval('.react-flow__node[data-id="shape"]',el=>el.textContent),/destination/);
 await page.keyboard.down('Control');await page.keyboard.down('Shift');await page.keyboard.press('z');await page.keyboard.up('Shift');await page.keyboard.up('Control');
 await new Promise(resolve=>setTimeout(resolve,300));
 await page.click('.react-flow__node[data-id="shape"]');
 await page.evaluate(()=>{document.activeElement?.blur();window.getSelection().removeAllRanges();});
 await page.keyboard.down('Control');await page.keyboard.press('c');await page.keyboard.up('Control');
 await page.$eval(cell(2),el=>{el.focus();window.getSelection().removeAllRanges();});
 await page.keyboard.down('Control');await page.keyboard.press('v');await page.keyboard.up('Control');
 await page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('भवति'),{},cell(2));
 assert.deepEqual(errors,[]);
 console.log('PASS cell-to-cell, Ctrl+C/V cell-to-object and object-to-cell, appearance, undo/redo and highlighted-text isolation');
} finally { await browser.close(); }
