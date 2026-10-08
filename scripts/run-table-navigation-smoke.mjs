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
  const active = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  const tab = async (reverse = false) => { if (reverse) await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); if (reverse) await page.keyboard.up('Shift'); };
  await page.focus('[aria-label="Column 1 name"]');
  await tab(); assert.equal(await active(), 'Column 2 name');
  await tab(); await tab(); assert.equal(await active(), 'Row 1 label');
  await tab(); assert.equal(await active(), 'Row 1, Column 0');
  await tab(true); assert.equal(await active(), 'Row 1 label');
  await page.focus('[aria-label="Row 1, Column 2"]');
  await tab(); assert.equal(await active(), 'Row 2 label');
  await tab(true); assert.equal(await active(), 'Row 1, Column 2');
  const styles = await page.evaluate(() => {
    const header = document.querySelector('thead th:nth-child(2)');
    const label = document.querySelector('tbody th');
    return [header, label].map(el => ({background: getComputedStyle(el).backgroundColor, weight: getComputedStyle(el).fontWeight}));
  });
  assert.deepEqual(styles[0], styles[1]);
  await page.focus('[aria-label="Row 2, Column 0"]');
  await page.keyboard.press('ArrowLeft'); assert.equal(await active(), 'Row 2 label');
  await page.keyboard.press('ArrowRight'); assert.equal(await active(), 'Row 2, Column 0');
  await page.keyboard.press('ArrowDown'); assert.equal(await active(), 'Row 3, Column 0');
  await page.keyboard.press('ArrowLeft'); assert.equal(await active(), 'Row 3 label');
  await page.keyboard.press('ArrowUp'); assert.equal(await active(), 'Row 2 label');
  await page.keyboard.press('ArrowUp'); assert.equal(await active(), 'Row 1 label');
  // Arrows inside text remain native caret navigation.
  await page.$eval('[aria-label="Row 1 label"]', el => { el.focus(); el.setSelectionRange(3,3); });
  await page.keyboard.press('ArrowRight'); assert.equal(await active(), 'Row 1 label');
  assert.equal(await page.$eval('[aria-label="Row 1 label"]', el => el.selectionStart), 4);
  await page.$eval('[aria-label="Row 1 label"]', el => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.press('ArrowRight'); assert.equal(await active(), 'Row 1, Column 0');
  await page.focus('[aria-label="Row 3, Column 2"]');
  await tab(); assert.equal(await active(), 'Row 4 label');
  assert.equal(await page.$$eval('tbody tr', rows => rows.length), 4);
  // A generated template cell participates in the same grid navigation.
  await page.locator('[aria-label="Row 2, Column 0"]').click();
  await page.select('[aria-label="Template"]', 'step');
  await page.focus(cell(1,0));
  await page.keyboard.press('ArrowLeft'); assert.equal(await active(), 'Row 2 label');
  await tab(); assert.equal(await active(), 'Template text, Column 0');
  await tab(true); assert.equal(await active(), 'Row 2 label');
  await page.screenshot({path:'.tmp/table-row-labels.png'});
  await page.locator('label').filter(el => el.textContent === 'Row labels').click();
  await page.focus('[aria-label="Row 1, Column 2"]');
  await tab(); assert.equal(await active(), 'Template text, Column 0');
  assert.deepEqual(errors, []);
  console.log('PASS row header appearance, Tab/Shift+Tab, arrows, caret editing, new-row labels, template cells and labels-off navigation');
} finally {
  await browser.close();
}
