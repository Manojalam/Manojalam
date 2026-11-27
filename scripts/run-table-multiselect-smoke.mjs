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
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-collapse',title:'Collapse rows',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'second',type:'table',position:{x:1050,y:240},style:{width:300,height:240},data:{table}},{id:'table',type:'table',position:{x:60,y:160},style:{width:900,height:240},data:{table}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-collapse',{waitUntil:'networkidle0'});


  await page.waitForSelector('[data-id="table"] [data-row]');
  await page.click('[data-id="table"] [aria-label="Move table"]');
  await page.keyboard.down('Control');
  await page.click('[data-id="second"] [data-row]');
  await page.keyboard.up('Control');
  assert.equal(await page.$$eval('.react-flow__node.selected',els=>els.length),2);
  await page.locator('button[role="tab"]::-p-text(Arrange)').click();
  await page.click('button[title="Align top"]');
  const tops=await page.$$eval('.react-flow__node.selected',els=>els.map(e=>e.getBoundingClientRect().top));
  assert.ok(Math.abs(tops[0]-tops[1])<1);
  await page.keyboard.down('Control');await page.click('[data-id="second"] [data-row]');await page.keyboard.up('Control');
  assert.equal(await page.$$eval('.react-flow__node.selected',els=>els.length),1);
  await page.keyboard.down('Shift');await page.click('[data-id="second"] [data-row]');await page.keyboard.up('Shift');
  assert.equal(await page.$$eval('.react-flow__node.selected',els=>els.length),2);
  assert.deepEqual(errors,[]);
  console.log('PASS: Ctrl-click and Shift-click select multiple tables, Arrange aligns both, and Ctrl-click deselects');
}finally{await browser.close();}
