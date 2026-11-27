import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless:true});
const page = await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const cell = n => `[data-row="r0"][data-column="c${n}"][role="group"]`;
const button = async name => { const h=await page.waitForFunction(name=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===name && el.getBoundingClientRect().width),{},name); await h.asElement().click(); };
try {
  await page.setViewport({width:1800,height:1050});
  await page.goto(base);
  await page.evaluate(async()=>{
    const template={id:'prakriya',name:'Prakriya',rows:[{id:'form',indent:0,collapsible:true,collapsedByDefault:true,fields:[{id:'form',label:'Form',kind:'text',color:'#be185d'}]},{id:'inner',indent:1,collapsible:true,collapsedByDefault:true,collapseParentId:'form',fields:[{id:'inner',label:'Details',kind:'text'}]},{id:'steps',indent:2,collapseParentId:'inner',fields:[{id:'steps',label:'Steps',kind:'multiline',color:'#2563eb'}]}],style:{fillColor:'',borderColor:'',textColor:'#111111',fontSize:22,lineSpacing:1.5,width:600}};
    const sections=[{id:'first',values:{inner:{text:'Details'},form:{text:'भवति'},steps:{text:'भू + तिप्\nभू + शप् + ति'}},extraRows:[]},{id:'second',values:{inner:{text:'Details'},form:{text:'भवतः'},steps:{text:'भू + तस्'}},extraRows:[]}];
    const table={columns:[{id:'c0',name:'एकवचनम्'},{id:'c1',name:'द्विवचनम्'}],rows:[{id:'r0',cells:['',''],templates:{c0:{template,sections,independent:true},c1:{template,sections,independent:true}}}]};
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-collapse',title:'Collapse rows',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'shape',type:'shape',position:{x:1050,y:160},style:{width:350,height:280},data:{shapeType:'rounded',fillColor:'#ffffff',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}},{id:'table',type:'table',position:{x:60,y:160},style:{width:900,height:240},data:{table}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-collapse',{waitUntil:'networkidle0'});

  const table='[data-id="table"]', shape='[data-id="shape"]';
  await page.waitForSelector(table+' [data-template-toggle]');
  const text=await page.$$eval(table+' .tiptap',els=>els.map(e=>e.textContent.replace(/[+−]/g,'')).join('|'));
  await page.click(table);
  await button('Expand all');
  assert.ok(await page.$$eval(table+' [data-template-toggle]',els=>els.length>=8&&els.every(e=>e.getAttribute('aria-expanded')==='true')));
  assert.ok(await page.$$eval(table+' p[data-template-parent]',els=>els.every(e=>getComputedStyle(e).display!=='none')));
  assert.ok(await page.$$eval(shape+' [data-template-toggle]',els=>els.every(e=>e.getAttribute('aria-expanded')==='false')));
  await button('Collapse all');
  assert.ok(await page.$$eval(table+' [data-template-toggle]',els=>els.every(e=>e.getAttribute('aria-expanded')==='false')));
  assert.ok(await page.$$eval(table+' p[data-template-parent]',els=>els.every(e=>getComputedStyle(e).display==='none')));
  assert.equal(await page.$$eval(table+' .tiptap',els=>els.map(e=>e.textContent.replace(/[+−]/g,'')).join('|')),text);
  await page.click(shape);
  await button('Expand all');
  assert.ok(await page.$$eval(shape+' [data-template-toggle]',els=>els.length>=4&&els.every(e=>e.getAttribute('aria-expanded')==='true')));
  assert.ok(await page.$$eval(table+' [data-template-toggle]',els=>els.every(e=>e.getAttribute('aria-expanded')==='false')));
  await new Promise(r=>setTimeout(r,2300));page.on('dialog',d=>d.accept());
  await page.reload({waitUntil:'networkidle0'});
  assert.ok(await page.$$eval(shape+' [data-template-toggle]',els=>els.length>=4&&els.every(e=>e.getAttribute('aria-expanded')==='true')));
  assert.ok(await page.$$eval(table+' [data-template-toggle]',els=>els.length>=8&&els.every(e=>e.getAttribute('aria-expanded')==='false')));
  assert.deepEqual(errors,[]);
  console.log('PASS: bulk toggle includes all table cells and nested groups, preserves content, isolates other objects, and persists after reload');
}finally{await browser.close();}

