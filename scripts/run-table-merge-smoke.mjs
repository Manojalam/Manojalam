// Start the app; BOARD_TEST_URL and BOARD_TEST_BROWSER override local defaults.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const cell = (row, column) => `[role="group"][data-row="r${row}"][data-column="c${column}"]`;
try {
  await page.setViewport({ width: 1900, height: 1050 });
  await page.goto(base);
  await page.evaluate(async()=>{const card={id:'step',name:'Derivation step',rows:[{id:'step-row',indent:0,fields:[{id:'expression',label:'Expression',kind:'text',color:'#ef4444'},{id:'sutra',label:'Sutra',kind:'sutra',color:'#2563eb'}]}],style:{fillColor:'#fff8dc',textColor:'#111111',fontSize:18,lineSpacing:1.5,width:400}};
  const table={columns:[0,1,2].map(i=>({id:'c'+i,name:'Column '+i})),rows:[0,1,2].map(i=>({id:'r'+i,label:i?'':'prathama',cells:[i?'':'Existing answer','','']})),showRowLabels:true};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});
  r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');
  tx.oncomplete=resolve;
  tx.objectStore('boards').put({id:'guest-column-fill',title:'Table template sizing',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:50,y:100},style:{width:660,height:240},data:{table}}],edges:[],settings:{cardTemplates:[card]},viewport:{x:0,y:0,zoom:0.8}}});
  });
  db.close()});
  
  await page.goto(`${base}/app/boards/guest-column-fill`, { waitUntil: "networkidle0" });
  const button = async name => {
    const handle = await page.waitForFunction(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getBoundingClientRect().width), {}, name);
    await handle.asElement().click();
  };
  await page.click('[aria-label="Row 1, Column 0"]');
  assert.equal(await page.evaluate(() => /Table · \d+ rows/.test(document.body.innerText)), false);
  await button('Add heading');
  await page.locator('[aria-label="Heading 1"]').fill('भू · लट् · परस्मैपदम्');
  assert.equal(await page.$eval('thead tr:first-child th', el => el.colSpan),4);
  await button('Add heading');
  await page.locator('[aria-label="Heading 2"]').fill('प्रक्रिया');
  assert.equal(await page.$$eval('thead tr', rows => rows.length),3);
  await button('Split cells');
  assert.equal(await page.$$eval('thead tr:nth-child(2) th', cells => cells.length),4);
  await page.locator('[aria-label="Row 2, Column 1"]').fill('लट्');
  await page.click('[aria-label="Row 1, Column 0"]');
  await page.keyboard.down('Shift');
  await page.click('[aria-label="Row 2, Column 1"]');
  await page.keyboard.up('Shift');
  await button('Merge cells');
  assert.equal(await page.$eval('tbody [data-cell-row="r0"][data-cell-column="c0"]', el => el.rowSpan),2);
  assert.equal(await page.$eval('tbody [data-cell-row="r0"][data-cell-column="c0"]', el => el.colSpan),2);
  assert.equal(await page.$eval('[aria-label="Row 1, Column 0"]', el => el.value),'Existing answer');
  assert.equal(await page.$eval('[aria-label="Row 2, Column 1"]', el => el.value),'लट्');
  await page.focus('[aria-label="Row 1, Column 0"]');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Row 1, Column 2');
  await page.click('[aria-label="Row 1, Column 0"]');
  await button('Split cells');
  assert.equal(await page.$$eval('tbody td', cells => cells.length),9);
  assert.equal(await page.$eval('[aria-label="Row 2, Column 1"]', el => el.value),'लट्');
  await page.click('[aria-label="Row 1, Column 0"]');
  await page.keyboard.down('Shift'); await page.click('[aria-label="Row 2, Column 1"]'); await page.keyboard.up('Shift');
  await button('Merge cells');
  await page.screenshot({path:'.tmp/table-merge-headings.png'});
  await new Promise(resolve => setTimeout(resolve,2200));
  await page.reload({waitUntil:'networkidle0'});
  assert.equal(await page.$eval('[aria-label="Heading 1"]', el => el.value),'भू · लट् · परस्मैपदम्');
  assert.equal(await page.$eval('[aria-label="Heading 2"]', el => el.value),'प्रक्रिया');
  assert.equal(await page.$eval('tbody [data-cell-row="r0"][data-cell-column="c0"]', el => el.rowSpan),2);
  await page.click('[aria-label="Row 1, Column 0"]');
  await button('Split cells');
  assert.equal(await page.$$eval('tbody td', cells => cells.length),9);
  assert.deepEqual(errors, []);
  console.log('PASS editable headings before table, split heading, rectangle merge/split, retained contents, spatial navigation and reload');
} catch (error) { await page.screenshot({path:".tmp/table-merge-failure.png"}); throw error; } finally {
  await browser.close();
}
