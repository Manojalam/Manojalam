import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage();
page.on('dialog', d=>d.accept());
try {
  await page.setViewport({width:1600,height:1000});
  await page.goto(base);
  await page.evaluate(async()=>{
    const nodes = ['a','b'].flatMap((prefix,k)=>Array.from({length:10},(_,i)=>({
      id:prefix+i,type:'shape',position:{x:80+k*650,y:100+i*40},style:{width:160,height:60},
      data:{text:i?'Cell':'Header',shapeType:'rectangle',fontSize:k?18:28,
        ...(i?{parentId:prefix+'0',matrixRootId:prefix+'0'}:{layoutMode:'matrix',layoutFoldCount:3,childOrder:Array.from({length:9},(_,j)=>prefix+(j+1))})}
    })));
    const req=indexedDB.open('manojalam-guest-boards',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('boards',{keyPath:'id'});
    const db=await new Promise(resolve=>{req.onsuccess=()=>resolve(req.result)});
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-dimensions',title:'Dimensions',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes,edges:[],settings:{},viewport:{x:0,y:0,zoom:.75}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-dimensions',{waitUntil:'networkidle0'});
  const sizes=prefix=>page.evaluate(p=>Array.from({length:10},(_,i)=>{const el=document.querySelector(`[data-id="${p}${i}"]`);return [parseFloat(el.style.width),parseFloat(el.style.height)]}),prefix);
  await page.click('[data-id="a0"]');
  await page.click('[role="tab"]::-p-text(Matrix)');
  await page.locator('button::-p-text(Copy dimensions)').click();
  const source=await sizes('a');
  await page.mouse.click(650,850);
  await page.click('[data-id="b0"]');
  await page.click('[role="tab"]::-p-text(Matrix)');
  await page.locator('button::-p-text(Apply dimensions)').click();
  await page.waitForFunction(expected=>expected.every(([w,h],i)=>{const el=document.querySelector(`[data-id="b${i}"]`);return Math.abs(parseFloat(el.style.width)-w)<2&&Math.abs(parseFloat(el.style.height)-h)<2}),{},source);
  assert.deepEqual(await sizes('a'),source,'source unaffected');
  await page.locator('button::-p-text(Auto Matrix widths)').click();
  await page.locator('button::-p-text(Auto Matrix heights)').click();
  await page.waitForFunction(old=>{const el=document.querySelector('[data-id="b1"]');return parseFloat(el.style.height)<old[1][1]}, {}, source);
  await page.screenshot({path:'.tmp/matrix-dimensions.png'});
  console.log('PASS: copy/apply matches visible matrix cells; whole-matrix Auto resets sizing');
} finally {await browser.close()}
