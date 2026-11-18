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
      tx.objectStore("boards").put({ id: "guest-table-test", title: "Table smoke test", description: "", accessRole: "owner", storageMode: "local", userId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes: [{id:"other",type:"shape",position:{x:0,y:0},data:{text:"English needle marker गुणत्वम्",richText:"<p>English <strong>needle</strong> marker गुणत्वम्</p>"},style:{width:200,height:100}},{id:"table-search",type:"table",position:{x:5000,y:5000},data:{table:{columns:[{id:"c",name:"Meaning"}],rows:Array.from({length:40},(_,i)=>({id:"r"+i,cells:[(i===10 || i===39)?"गुणत्वम्":"Other row "+i],...((i===10 || i===39)?{richCells:{c:"<p><strong>गुण</strong>त्वम्</p>"}}:{})}))}}},...imageRows,...sections,{id:'long-search',type:'shape',position:{x:16000,y:10000},style:{width:1400,height:2600},data:{text:Array.from({length:15},(_,i)=>`Occurrence ${i+1}: कृतिः`).join('\n'),richText:Array.from({length:15},(_,i)=>`<p>Occurrence ${i+1}: <strong>कृतिः</strong> अन्यपदम्</p>`).join(''),fontSize:30,textPadding:30}}].reverse(), edges: [], viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(`${base}/app/boards/guest-table-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector('.react-flow');
  await page.keyboard.down('Control'); await page.keyboard.press('f'); await page.keyboard.up('Control');
  await page.locator('[aria-label="Search board"]').fill('कृति');
  const expectOccurrence=async number=>{
    await page.waitForFunction(number=>{
      const range=[...(CSS.highlights.get('board-search-active')??[])][0];
      return document.querySelector('[role="search"] [role="status"]')?.textContent===`${number} of 15`
        && range?.toString()==='कृति'
        && range.startContainer.parentElement.closest('p')?.textContent.includes(`Occurrence ${number}:`);
    },{},number);
  };
  await expectOccurrence(1);
  await new Promise(resolve=>setTimeout(resolve,250));
  const firstViewport=await page.$eval('.react-flow__viewport',el=>el.style.transform);
  await page.keyboard.press('Tab'); await expectOccurrence(2);
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(await page.$eval('.react-flow__viewport',el=>el.style.transform),firstViewport,'Already visible next occurrence must not move the viewport');
  for(let n=3;n<=10;n++){ await page.keyboard.press('Tab'); await expectOccurrence(n); await new Promise(resolve=>setTimeout(resolve,180)); }
  console.log("tenth located before repaint");
  await page.evaluate(()=>{
    const range=[...CSS.highlights.get('board-search-active')][0];
    const paragraph=range.startContainer.parentElement.closest('p');
    paragraph.innerHTML=paragraph.innerHTML; // Same-content DOM replacement, as editor synchronization does.
  });
  await expectOccurrence(10);
  await page.waitForFunction(()=>{
    const rect=[...CSS.highlights.get('board-search-active')][0].getBoundingClientRect();
    const canvas=document.querySelector('.react-flow').getBoundingClientRect();
    return rect.top>canvas.top+100 && rect.bottom<canvas.bottom-40;
  });
  await page.screenshot({path:'.tmp/search-tenth-visible.png'});
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expectOccurrence(12);
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await expectOccurrence(10);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const paragraph=document.querySelector('[data-id="long-search"] p');
    if (paragraph) paragraph.innerHTML=paragraph.innerHTML;
  });
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await page.evaluate(()=>CSS.highlights.has('board-search-active')),false,'Closing search disconnects highlight refresh');
  assert.deepEqual(errors,[]);
  console.log('PASS: Tenth Sanskrit match remains highlighted after rich-text DOM replacement');
} catch (error) {
  console.log(await page.evaluate(()=>({text:document.body.innerText.slice(-2000),ranges:[...(CSS.highlights.get('board-search-active')??[])].map(r=>({text:r.toString(),parent:r.startContainer.parentElement?.closest('p')?.textContent}))})));
  await page.screenshot({path:'.tmp/search-persistence-failure.png'});
  throw error;
} finally { await browser.close(); }
