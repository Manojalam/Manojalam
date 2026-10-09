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
    const table={columns:[{id:'c0',name:'एकवचनम्'},{id:'c1',name:'द्विवचनम्'}],rows:[{id:'r0',cells:['',''],templates:{c0:{template,sections,independent:true},c1:{template,sections,independent:true}}}]};
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-collapse',title:'Collapse rows',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:60,y:160},style:{width:900,height:362},data:{table,tableMinHeight:362}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-collapse',{waitUntil:'networkidle0'});
  const first=cell(0)+' [data-template-toggle]';
  await page.waitForSelector(first);
  await page.waitForFunction(() => {
    const node = document.querySelector('.react-flow__node[data-id="table"]');
    const table = node?.querySelector('table');
    return node && table && Math.abs(node.offsetHeight - table.offsetHeight - 2) <= 1;
  });
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$eval(cell(0)+' p[data-template-parent]',el=>getComputedStyle(el).display),'none');
  const collapsedHeight = await page.$eval('.react-flow__node[data-id="table"]', el => el.offsetHeight);
  await page.click(first);
  await page.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-expanded')==='true',{},first);
  assert.notEqual(await page.$eval(cell(0)+' p[data-template-parent]',el=>getComputedStyle(el).display),'none');
  assert.equal(await page.$eval(cell(1)+' [data-template-toggle]',el=>el.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$$eval(cell(0)+' [data-template-toggle]',els=>els[1].getAttribute('aria-expanded')),'false');
  await page.waitForFunction(height => document.querySelector('.react-flow__node[data-id="table"]').offsetHeight > height, {}, collapsedHeight);
  // Keyboard accessible, with controls excluded from capture.
  await page.focus(first); await page.keyboard.press('Enter');
  await page.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-expanded')==='false',{},first);
  await page.waitForFunction(() => {
    const node = document.querySelector('.react-flow__node[data-id="table"]');
    const table = node?.querySelector('table');
    return node && table && Math.abs(node.offsetHeight - table.offsetHeight - 2) <= 1;
  });
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'false');
  await page.click(first);
  assert.equal(await page.$eval(first,el=>el.hasAttribute('data-export-ignore')),true);
  await new Promise(r=>setTimeout(r,2200));
  await page.reload({waitUntil:'networkidle0'});
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'true');
  assert.match(await page.$eval(cell(0),el=>el.textContent),/भू \+ शप् \+ ति/);
  await page.click(first);
  await new Promise(resolve => setTimeout(resolve, 2200));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(() => {
    const node = document.querySelector('.react-flow__node[data-id="table"]');
    const table = node?.querySelector('table');
    return node && table && Math.abs(node.offsetHeight - table.offsetHeight - 2) <= 1;
  });
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'false');
  assert.deepEqual(errors, []);
  console.log('PASS collapsed table fits on load, expand, collapse and reload; independent fields and values retained');
} finally { await browser.close(); }
