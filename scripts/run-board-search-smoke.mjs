import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("dialog", dialog => dialog.accept());
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/app/boards`, { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("manojalam-guest-boards", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const slide=document.createElement('canvas'); slide.width=400; slide.height=250;
    const context=slide.getContext('2d'); context.fillStyle='#e5f5e0'; context.fillRect(0,0,400,250);
    context.fillStyle='#222'; context.font='24px sans-serif'; context.fillText('Slide image',30,60);
    const slideUrl=slide.toDataURL('image/png');
    const imageRows=Array.from({length:100},(_,i)=>[
      {id:'slide-'+i,type:'image',position:{x:8000,y:i*380},style:{width:400,height:250},data:{imageNotesBatchId:'slides',image:{id:'img-'+i,kind:'image',name:'Slide '+i,dataUrl:slideUrl,mimeType:'image/png',createdAt:new Date().toISOString(),width:400,height:250}}},
      {id:'notes-'+i,type:'shape',position:{x:8500,y:i*380},style:{width:500,height:250},data:{text:i===80?'प्रारम्भ एवं नीलरूपं एवं नीलरूपं समाप्तिः':'Slide notes '+i,richText:i===80?'<p>प्रारम्भ एवं <strong>नील</strong>रूपं एवं नीलरूपं समाप्तिः</p>':undefined,imageNotesFor:'Slide '+i,noteForNodeId:'slide-'+i}},
    ]).flat();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      tx.objectStore("boards").put({ id: "guest-table-test", title: "Table smoke test", description: "", accessRole: "owner", storageMode: "local", userId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [{id:"other",type:"shape",position:{x:0,y:0},data:{text:"English needle marker गुणत्वम्",richText:"<p>English <strong>needle</strong> marker गुणत्वम्</p>"},style:{width:200,height:100}},{id:"table-search",type:"table",position:{x:5000,y:5000},data:{table:{columns:[{id:"c",name:"Meaning"}],rows:Array.from({length:40},(_,i)=>({id:"r"+i,cells:[(i===10 || i===39)?"गुणत्वम्":"Other row "+i],...((i===10 || i===39)?{richCells:{c:"<p><strong>गुण</strong>त्वम्</p>"}}:{})}))}}},...imageRows], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-table-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.react-flow');
  const openingViewport=await page.$eval('.react-flow__viewport',el=>el.style.transform);
  await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
  await page.waitForSelector('[aria-label="Search board"]');
  assert.equal(await page.$eval('.react-flow__viewport',el=>el.style.transform),openingViewport,'Ctrl+F must not fit or move the board');
  await page.locator('[aria-label="Search board"]').fill('गुणत्वम्');
  await page.waitForSelector('[role="dialog"] button::-p-text(गुणत्वम्)');
  const before=await page.$eval('.react-flow__viewport',el=>el.style.transform);
  await page.click('[role="dialog"] button::-p-text(table)');
  await page.waitForFunction(previous=>document.querySelector('.react-flow__viewport').style.transform!==previous,{},before);
  await page.waitForSelector('[role="tab"]::-p-text(Table)');
  await page.waitForFunction(() => {
    const box=document.querySelector('[data-id="table-search"]')?.getBoundingClientRect();
    return box && box.right>0 && box.bottom>0 && box.left<innerWidth && box.top<innerHeight;
  });
  assert.equal(await page.$('[role="dialog"]'),null);
  await page.waitForFunction(() => {
    const highlights=CSS.highlights.get('board-search-match');
    if (!highlights || !highlights.size) return false;
    const range=[...highlights][0];
    const rect=range.getBoundingClientRect();
    const canvas=document.querySelector('.react-flow').getBoundingClientRect();
    return document.querySelector('.react-flow__viewport').style.transform.endsWith('scale(1)') && range.toString()==='गुणत्वम्' && Math.abs((rect.y+rect.height/2)-(canvas.y+canvas.height/2))<80;
  });
  await page.waitForFunction(()=>document.querySelector('.react-flow__viewport').style.transform.endsWith('scale(1)'));
  assert.match(await page.$eval('.react-flow__viewport',el=>el.style.transform), /scale\(1\)/);
  assert.equal(await page.$eval('[data-id="table-search"]',el=>el.querySelectorAll('mark').length),0,'search does not modify saved rich text');
  await page.screenshot({path:'.tmp/search-word-highlight.png'});
  const expectMatch = async (counter, nodeId) => {
    await page.waitForFunction((counter,nodeId)=>{
      const status=document.querySelector('[aria-label="Board match navigation"] [role="status"]');
      const range=[...(CSS.highlights.get('board-search-active')??[])][0];
      if (!range || status?.textContent!==counter) return false;
      const element=range.startContainer.parentElement.closest('.react-flow__node');
      const rect=range.getBoundingClientRect();
      const canvas=document.querySelector('.react-flow').getBoundingClientRect();
      return element?.dataset.id===nodeId && Math.abs(rect.y+rect.height/2-canvas.y-canvas.height/2)<40;
    },{},counter,nodeId);
  };
  await expectMatch('2 of 3','table-search');
  await page.click('[aria-label="Next match"]');
  await expectMatch('3 of 3','table-search');
  assert.equal(await page.evaluate(()=>[...CSS.highlights.get('board-search-active')][0].startContainer.parentElement.closest('[data-row]')?.getAttribute('data-row')),'r39');
  await page.keyboard.press('F3');
  await expectMatch('1 of 3','other');
  await page.keyboard.down('Shift'); await page.keyboard.press('F3'); await page.keyboard.up('Shift');
  await expectMatch('3 of 3','table-search');
  await page.click('[aria-label="Previous match"]');
  await expectMatch('2 of 3','table-search');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('[aria-label="Board match navigation"]'),null);

  assert.equal(await page.evaluate(()=>CSS.highlights.has('board-search-match')),false);
  await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
  await page.locator('[aria-label="Search board"]').fill('needle');
  await page.click('[role="dialog"] button::-p-text(needle)');
  await page.waitForFunction(()=>{
    const range=[...(CSS.highlights.get('board-search-match')??[])][0];
    if (!range || range.toString()!=='needle') return false;
    const rect=range.getBoundingClientRect();
    const canvas=document.querySelector('.react-flow').getBoundingClientRect();
    return Math.abs(rect.y+rect.height/2-canvas.y-canvas.height/2)<80;
  });
  await page.keyboard.press('Escape');
  await page.click('.react-flow__pane',{offset:{x:50,y:70}});
  const beforeLongSearch=await page.$eval('.react-flow__viewport',el=>el.style.transform);
  await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
  await page.waitForSelector('[aria-label="Search board"]');
  assert.equal(await page.$eval('.react-flow__viewport',el=>el.style.transform),beforeLongSearch,'Opening search on a long image board must preserve viewport');
  await page.locator('[aria-label="Search board"]').fill('एवं नील');
  await page.keyboard.press('Enter');
  await expectMatch('1 of 2','notes-80');
  await page.click('[aria-label="Next match"]');
  await expectMatch('2 of 2','notes-80');
  await page.waitForFunction(()=>document.querySelector('.react-flow__viewport').style.transform.endsWith('scale(1)'));
  await page.waitForSelector('[data-id="slide-80"] img');
  await page.screenshot({path:'.tmp/search-image-notes-navigation.png'});
  await page.click('[aria-label="Close search"]');
  assert.equal(await page.evaluate(()=>CSS.highlights.has('board-search-active')),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: Search navigates repeated table/shape matches, wraps both ways, supports F3/Shift+F3, resets query and clears with Escape');
} finally { await browser.close(); }
