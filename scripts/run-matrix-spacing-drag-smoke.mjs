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
  // Both header drags and the multi-selection rectangle must carry both grids.
  await page.keyboard.down('Shift'); await page.click('[data-id="a0"]'); await page.keyboard.up('Shift');
  const positions=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(el=>{const r=el.getBoundingClientRect();return [el.dataset.id,{x:r.x,y:r.y}]})));
  const before=await positions();
  const root=await page.$('[data-id="a0"]'); const box=await root.boundingBox();
  await page.mouse.move(box.x+40,box.y+20); await page.mouse.down(); await page.mouse.move(box.x+100,box.y+140,{steps:12}); await page.mouse.up();
  await new Promise(r=>setTimeout(r,800));
  const after=await positions(); const delta={x:after.a0.x-before.a0.x,y:after.a0.y-before.a0.y};

  await page.screenshot({path:'.tmp/drag-debug.png'});
  assert.ok(Math.abs(delta.y)>40,'drag moves the selection');
  for(const id of Object.keys(before)) {
    assert.ok(Math.abs(after[id].x-before[id].x-delta.x)<2,`${id} moves horizontally with its matrix`);
    assert.ok(Math.abs(after[id].y-before[id].y-delta.y)<2,`${id} moves vertically with its matrix`);
  }
  await page.mouse.click(100,700); await page.keyboard.down('Shift');
  await page.mouse.move(90,240); await page.mouse.down(); await page.mouse.move(1100,490,{steps:12}); await page.mouse.up(); await page.keyboard.up('Shift');
  await page.screenshot({path:'.tmp/selection-debug.png'});
  await page.waitForSelector('.react-flow__nodesselection-rect',{timeout:3000});
  const selectionBefore=await positions();
  await page.mouse.move(610,300); await page.mouse.down(); await page.mouse.move(640,370,{steps:10}); await page.mouse.up();
  await new Promise(r=>setTimeout(r,300));
  const selectionAfter=await positions(); const selectionDelta={x:selectionAfter.a0.x-selectionBefore.a0.x,y:selectionAfter.a0.y-selectionBefore.a0.y};
  assert.ok(Math.abs(selectionDelta.y)>20,'selection rectangle moves matrices');
  for(const id of Object.keys(selectionBefore)) {
    assert.ok(Math.abs(selectionAfter[id].x-selectionBefore[id].x-selectionDelta.x)<2,`${id} follows selection horizontally`);
    assert.ok(Math.abs(selectionAfter[id].y-selectionBefore[id].y-selectionDelta.y)<2,`${id} follows selection vertically`);
  }
  const spacing=await page.$eval('[data-id="a1"] .ProseMirror',el=>{
    const sample=el.parentElement.cloneNode(true);
    sample.style.width='150px'; document.body.append(sample);
    const editor=sample.querySelector('.ProseMirror'); editor.querySelector('p').textContent='आताम्'+' '.repeat(40);
    const result={text:editor.textContent,width:editor.clientWidth,scroll:editor.scrollWidth,whiteSpace:getComputedStyle(editor).whiteSpace};
    sample.remove();return result;
  });
  assert.equal(spacing.whiteSpace,'pre-wrap');
  assert.equal(spacing.text,'आताम्'+' '.repeat(40));
  assert.ok(spacing.scroll<=spacing.width+1,JSON.stringify(spacing));
  console.log('PASS: selected matrices and grid frames move together; trailing whitespace does not widen fitted text');
} finally {await browser.close()}



