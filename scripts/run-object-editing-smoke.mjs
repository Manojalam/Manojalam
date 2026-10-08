import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.BOARD_TEST_URL??'http://localhost:3093';
const browser=await puppeteer.launch({executablePath:process.env.BOARD_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();page.on('dialog',dialog=>dialog.accept());await page.setViewport({width:1700,height:1000});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
const clickText=async text=>{const h=await page.waitForFunction(text=>[...document.querySelectorAll('#board-properties button')].find(el=>el.textContent.trim()===text&&el.getBoundingClientRect().width),{},text);await h.asElement().click()};
const word=async(selector,text)=>{
 const point=await page.$eval(selector,(el,text)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while(node=w.nextNode()){const i=node.textContent.indexOf(text);if(i<0)continue;const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+text.length);const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}}throw Error('Text not found: '+text)},text);
 await page.mouse.click(point.x,point.y,{count:2});
};
try{
 await page.goto(base);
 await page.evaluate(async()=>{
  const types=['shape','mindmap','text','sticky','sanskrit','shloka','grammar','frame','table','sunburst','relationshipDiagram','audio','junction'];
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;
   for(const type of types)tx.objectStore('boards').put({id:'guest-edit-'+type,title:type,storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type,position:{x:100,y:200},style:{width:700,height:260},data:{text:'Alpha beta',richText:'<p>Alpha beta</p>',title:'Alpha beta',topic:'Alpha beta',rule:'Alpha beta',devanagari:'Alpha beta',fontSize:24,table:{columns:[{id:'a',name:'Alpha beta'},{id:'b',name:'Second'}],rows:[{id:'r',label:'Alpha beta',cells:['Alpha beta','Second']}],showRowLabels:true}}}],edges:[],settings:{},viewport:{x:0,y:0,zoom:1}}});
  });db.close();
 });
 for(const type of (process.env.BOARD_TEST_TYPES?.split(',')??['shape','text','sticky','sanskrit','shloka','grammar','frame','table','sunburst','relationshipDiagram'])){
  await page.goto(base+'/app/boards/guest-edit-'+type,{waitUntil:'networkidle0'});
  await page.waitForSelector('.react-flow__node');
  await page.$eval('.react-flow__node',el=>el.click());await page.click('[aria-label="Object properties"]');
  await clickText('Text');assert.ok(await page.$('#board-properties [data-universal-text-tools="inspector"]'),type+' Text');
  if(['table','sanskrit'].includes(type)){
    await page.locator('#board-properties [aria-label="Line spacing"]').fill('2');await page.keyboard.press('Tab');
    await page.waitForFunction(()=>{const p=document.querySelector('.react-flow__node .ProseMirror p');return p && parseFloat(getComputedStyle(p).lineHeight)===2*parseFloat(getComputedStyle(p).fontSize)});
  }
  await clickText(({table:'Table',sunburst:'Radial',relationshipDiagram:'Diagram'})[type]??'Arrange');assert.ok(await page.$('#board-properties input[type=number]'),type+' dimensions');
  await clickText('Style');await page.evaluate(()=>document.fonts.ready);await new Promise(r=>setTimeout(r,500));
  if(['sunburst','relationshipDiagram'].includes(type)){console.log('PASS '+type+' shared inspector');continue;}
  const surface=type==='table'?'[aria-label="Row 1, Alpha beta"] .ProseMirror':['sanskrit','shloka','frame'].includes(type)?'[data-object-text-field="title"] .ProseMirror':type==='grammar'?'[data-object-text-field="topic"] .ProseMirror':'.react-flow__node .ProseMirror';
  await word(surface,'Alpha');
  await page.waitForFunction(()=>window.getSelection()?.toString()==='Alpha');
  await page.waitForSelector('#board-properties [aria-label="Selected text controls"] [title="Bold"]');
  await page.click('#board-properties [aria-label="Selected text controls"] [title="Bold"]');
  assert.equal(await page.evaluate(()=>window.getSelection().toString()),'Alpha',type+' formatting preserves selection');
  await page.waitForSelector(surface+' strong');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await word(surface,'beta');await page.waitForFunction(()=>window.getSelection()?.toString()==='beta');assert.equal(await page.evaluate(()=>window.getSelection().toString()),'beta',type+' native word selection');
  if(type==='table'){
    await page.keyboard.press('Tab');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('contenteditable')==='true' && document.activeElement?.closest('[data-column]')?.dataset.column==='b');
    await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('contenteditable')==='true' && document.activeElement?.closest('[data-column]')?.dataset.column==='a');
    await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('contenteditable')==='true' && document.activeElement?.closest('[data-column]')?.dataset.column==='$row-label');
    await page.keyboard.press('End');await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('contenteditable')==='true' && document.activeElement?.closest('[data-column]')?.dataset.column==='a');
  }
  await page.mouse.click(1100,800);await new Promise(r=>setTimeout(r,2200));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector(surface+' strong');
  if(['shape','text','sticky'].includes(type)){
    const bounds=await page.$eval('.react-flow__node',el=>{const b=el.getBoundingClientRect();return {x:b.right-24,y:b.bottom-24}});
    await page.mouse.click(bounds.x,bounds.y,{count:2});
    await page.waitForFunction(()=>window.getSelection()?.toString()==='Alpha beta');
  }
  assert.equal(await page.$eval(surface+' strong',el=>el.textContent),'Alpha',type+' formatting survives reload');
  console.log('PASS '+type+' text/size/style, word selection, docked formatting and reload');
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:'.tmp/object-editing.png'});
}catch(e){await page.screenshot({path:'.tmp/object-editing-failure.png'});throw e}finally{await browser.close()}
