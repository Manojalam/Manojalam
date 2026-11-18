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
    const sections=['left','right'].flatMap((side,i)=>[
      {id:side+'-root',type:'shape',position:{x:12000+i*700,y:0},style:{width:500,height:80},data:{text:side+' matrix',layoutMode:'matrix'}},
      ...[100,400].map((y,j)=>({id:side+'-'+j,type:'shape',position:{x:12000+i*700,y},style:{width:500,height:100},data:{text:'sectionword '+side+' '+j,parentId:side+'-root'}})),
    ]);
    const imageRows=Array.from({length:100},(_,i)=>[
      {id:'slide-'+i,type:'image',position:{x:8000,y:i*380},style:{width:400,height:250},data:{imageNotesBatchId:'slides',image:{id:'img-'+i,kind:'image',name:'Slide '+i,dataUrl:slideUrl,mimeType:'image/png',createdAt:new Date().toISOString(),width:400,height:250}}},
      {id:'notes-'+i,type:'shape',position:{x:8500,y:i*380},style:{width:500,height:250},data:{text:i===80?'प्रारम्भ एवं नीलरूपं एवं नीलरूपं समाप्तिः':'Slide notes '+i,richText:i===80?'<p>प्रारम्भ एवं <strong>नील</strong>रूपं एवं नीलरूपं समाप्तिः</p>':undefined,imageNotesFor:'Slide '+i,noteForNodeId:'slide-'+i}},
    ]).flat();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      tx.objectStore("boards").put({ id: "guest-table-test", title: "Table smoke test", description: "", accessRole: "owner", storageMode: "local", userId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [{id:"other",type:"shape",position:{x:0,y:0},data:{text:"English needle marker गुणत्वम्",richText:"<p>English <strong>needle</strong> marker गुणत्वम्</p>"},style:{width:200,height:100}},{id:"table-search",type:"table",position:{x:5000,y:5000},data:{table:{columns:[{id:"c",name:"Meaning"}],rows:Array.from({length:40},(_,i)=>({id:"r"+i,cells:[(i===10 || i===39)?"गुणत्वम्":"Other row "+i],...((i===10 || i===39)?{richCells:{c:"<p><strong>गुण</strong>त्वम्</p>"}}:{})}))}}},...imageRows,...sections].reverse(), edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-table-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.react-flow');
  const nodeCount=()=>page.$eval('body',el=>el.innerText.match(/(\d+) nodes/)?.[1]);
  const originalCount=await nodeCount();
  const expectMatch = async (counter, nodeId) => {
    await page.waitForFunction((counter,nodeId)=>{
      const status=document.querySelector('[aria-label="Board match navigation"] [role="status"]');
      const range=[...(CSS.highlights.get('board-search-active')??[])][0];
      if (!range || status?.textContent!==counter) return false;
      const rect=range.getBoundingClientRect();
      const canvas=document.querySelector('.react-flow').getBoundingClientRect();
      return range.startContainer.parentElement.closest('.react-flow__node')?.dataset.id===nodeId
        && Math.abs(rect.y+rect.height/2-canvas.y-canvas.height/2)<40;
    },{},counter,nodeId);
  };
  const openSearch=async()=>{
    await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
    await page.waitForSelector('[aria-label="Search board"]');
  };
  await openSearch();
  await page.locator('[aria-label="Search board"]').fill('गुणत्वम्');
  await expectMatch('1 of 3','other'); // No Enter or result click.
  await page.keyboard.press('Tab');
  await expectMatch('2 of 3','table-search');
  await page.keyboard.press('Tab');
  await expectMatch('3 of 3','table-search');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await expectMatch('2 of 3','table-search');
  await page.click('[aria-label="Next match"]');
  await expectMatch('3 of 3','table-search');
  assert.equal(await nodeCount(),originalCount,'Tab must not create child/sibling nodes');
  await page.keyboard.press('Escape');
  await openSearch(); // Table remains selected: scope captures table and stays fixed.
  await expectMatch('1 of 2','table-search');
  assert.equal(await page.$eval('[aria-label="Search scope"]',el=>el.value),'selection');
  await page.keyboard.press('Tab'); await expectMatch('2 of 2','table-search');
  await page.keyboard.press('Tab'); await expectMatch('1 of 2','table-search');
  await page.select('[aria-label="Search scope"]','board');
  await expectMatch('1 of 3','other');
  await page.keyboard.press('Tab'); await expectMatch('2 of 3','table-search');
  await page.locator('[aria-label="Search board"]').fill('no-such-word');
  await page.waitForFunction(()=>document.querySelector('[role="search"] [role="status"]').textContent==='No matches');
  await page.keyboard.press('Tab');
  assert.equal(await nodeCount(),originalCount,'Tab with no matches must not create a node');
  await page.locator('[aria-label="Search board"]').fill('एवं नील');
  await expectMatch('1 of 2','notes-80');
  await page.keyboard.press('Tab'); await expectMatch('2 of 2','notes-80');
  await page.keyboard.press('Escape');
  await openSearch();
  await expectMatch('1 of 2','notes-80');
  await page.locator('[aria-label="Search board"]').fill('needle');
  await page.waitForFunction(()=>document.querySelector('[role="search"] [role="status"]').textContent==='No matches');
  await page.select('[aria-label="Search scope"]','board');
  await expectMatch('1 of 1','other');
  await page.keyboard.press('Tab'); await expectMatch('1 of 1','other');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>CSS.highlights.has('board-search-active')),false);
  assert.equal(await nodeCount(),originalCount);
  await openSearch();
  await page.select('[aria-label="Search scope"]','board');
  await page.locator('[aria-label="Search board"]').fill('sectionword');
  await expectMatch('1 of 4','left-0');
  await page.keyboard.press('Tab'); await expectMatch('2 of 4','left-1');
  await page.keyboard.press('Tab'); await expectMatch('3 of 4','right-0');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await expectMatch('2 of 4','left-1');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await expectMatch('1 of 4','left-0');
  await page.keyboard.press('Escape');
  await page.click('[data-id="left-root"]');
  await openSearch();
  await expectMatch('1 of 2','left-0');
  await page.keyboard.press('Tab'); await expectMatch('2 of 2','left-1');
  await page.keyboard.press('Tab'); await expectMatch('1 of 2','left-0');
  await page.screenshot({path:'.tmp/search-auto-section-scope.png'});
  assert.equal(await nodeCount(),originalCount,'Scoped matrix navigation must not add nodes');
  assert.deepEqual(errors,[]);
  console.log('PASS: Automatic first match, Tab/Shift+Tab, stable selected-table/shape scope, entire-board switch, no-match keyboard safety, and no created nodes');
} finally { await browser.close(); }
