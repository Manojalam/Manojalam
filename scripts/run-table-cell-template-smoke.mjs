// Start the app; BOARD_TEST_URL and BOARD_TEST_BROWSER override local defaults.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const cell = (row, column) => `[role="group"][data-row="r${row}"][data-column="c${column}"]`;
const field = "#card-field-expression";
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
  await page.locator('textarea[aria-label="Row 1, Column 0"]').click();
  await page.select('[aria-label="Template for this column"]', 'step');
  await page.locator(field).fill('भू + तिप्');
  await page.waitForFunction(() => document.querySelector('tbody td')?.textContent.includes('भू + तिप्'));
  assert.equal(await page.$eval('tbody td > div', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.$$eval('table button', buttons => buttons.some(button => /Fill fields|Fill column|Use template/.test(button.textContent))), false);
  assert.equal(await page.$eval('[aria-label="Column 1 name"]', el => el.value), 'Column 0');
  assert.equal(await page.$eval('[aria-label="Row 1 label"]', el => el.value), 'prathama');
  assert.equal(await page.$eval('textarea[aria-label="Row 1, Column 0"]', el => el.value), 'Existing answer');

  // Different cells open their own section, and another column starts independently.
  await page.locator(cell(1, 0)).click();
  assert.equal(await page.$eval(field, el => el.value), '');
  await page.locator(field).fill('भवति');
  await page.locator('textarea[aria-label="Row 1, Column 1"]').click();
  await page.select('[aria-label="Template for this column"]', 'step');
  assert.equal(await page.$eval(field, el => el.value), '');
  await page.locator(field).fill('गम्');
  await page.locator(cell(0, 0)).click();
  assert.equal(await page.$eval(field, el => el.value), 'भू + तिप्');
  await page.focus(cell(0, 0));
  await page.keyboard.press('Tab');
  assert.equal(await page.$eval('[aria-label="Column to fill"]', el => el.value), 'c1');

  // Wait for guest-board autosave, then verify persisted values by clicking a cell.
  await new Promise(resolve => setTimeout(resolve, 2200));
  await page.reload({ waitUntil: "networkidle0" });
  await page.locator(cell(1, 0)).click();
  assert.equal(await page.$eval(field, el => el.value), 'भवति');
  assert.deepEqual(errors, []);
  console.log('PASS click-to-fill, unchanged table background, no template labels, independent cells, keyboard navigation and reload');
} finally {
  await browser.close();
}

