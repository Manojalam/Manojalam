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
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-collapse',title:'Collapse rows',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:60,y:160},style:{width:900,height:362},data:{table,tableMinHeight:362,locked:true,layerId:"locked-layer"}},{id:"shape",type:"shape",position:{x:1050,y:160},style:{width:300,height:180},selectable:false,data:{shapeType:"rounded",fillColor:"#ffcc00",text:"destination",locked:true}}],edges:[],layers:[{id:"locked-layer",name:"Locked layer",visible:true,locked:true,order:0}],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-collapse',{waitUntil:'networkidle0'});


 await page.waitForSelector('.react-flow__node[data-id="shape"]');
 await page.click('.react-flow__node[data-id="shape"]');
 await page.waitForSelector('[aria-label="Unlock selected objects"]');
 await page.click('[aria-label="Unlock selected objects"]');
 await page.waitForSelector('[aria-label="Lock selected objects"]');
 await page.click('[aria-label="Lock selected objects"]');
 await page.waitForSelector('[aria-label="Unlock selected objects"]');
 await page.click('[title="Layers"]');
 await page.waitForSelector('[aria-label="Unlock objects and layers"]');
 await page.click('[aria-label="Unlock object shape"]');
 assert.equal(await page.$('[aria-label="Unlock object shape"]'),null);
 await page.$eval('[aria-label="Unlock objects and layers"]',el=>[...el.querySelectorAll('button')].find(b=>b.textContent==='Unlock all').click());
 await new Promise(resolve=>setTimeout(resolve,2200));
 const saved=await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
  const b=await new Promise(resolve=>{const r=db.transaction('boards').objectStore('boards').get('guest-collapse');r.onsuccess=()=>resolve(r.result)});db.close();return b.content;
 });
 assert.ok(saved.nodes.every(n=>!n.data.locked));assert.ok(saved.layers.every(l=>!l.locked));
 await page.reload({waitUntil:'networkidle0'});
 await page.click('.react-flow__node[data-id="table"]');
 await page.waitForSelector('[aria-label="Lock selected objects"]');
 assert.deepEqual(errors,[]);
 console.log('PASS saved locked object selection, lock/unlock header, Layers recovery, unlock all and persistence');
} finally {await browser.close()}

