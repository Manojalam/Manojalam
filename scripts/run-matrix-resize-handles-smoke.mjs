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
  const bounds=()=>page.$eval('[data-matrix-resize-outline]',el=>({width:parseFloat(el.style.width),height:parseFloat(el.style.height)}));
  async function resize(label,dx,dy) {
    const handle=await page.$(`button[aria-label="${label}"]`); const box=await handle.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:10}); await page.waitForSelector('[data-alignment-guide]'); await page.mouse.up();
    await page.waitForFunction(()=>!document.querySelector('[data-alignment-guide]'));
    await new Promise(resolve=>setTimeout(resolve,600));
  }
  const before=await bounds(); const cellBefore=await sizes('a');
  await resize('Resize whole matrix',100,60);
  const expanded=await bounds();
  assert.ok(expanded.width>before.width+50 && expanded.height>before.height+20);
  assert.ok(Math.abs(expanded.width/expanded.height-before.width/before.height)<.03);
  const cellsExpanded=await sizes('a');
  assert.ok(cellsExpanded.every((size,i)=>size[0]>cellBefore[i][0] && size[1]>cellBefore[i][1]),'all cells expand');
  await resize('Resize whole matrix',-140,-90);
  const shrunk=await bounds(); assert.ok(shrunk.width<expanded.width-50 && shrunk.height<expanded.height-20);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await page.waitForFunction(expected=>Math.abs(parseFloat(document.querySelector('[data-matrix-resize-outline]').style.width)-expected)<2,{},expanded.width);
  const restored=await bounds();
  await resize('Resize matrix width',60,0);
  const wider=await bounds(); assert.ok(wider.width>restored.width+40);assert.ok(Math.abs(wider.height-restored.height)<2);
  await page.screenshot({path:'.tmp/matrix-resize-handles.png'});
  console.log('PASS: whole-matrix expansion, shrink, proportional sizing, Undo and width-only resize');
} finally {await browser.close()}

