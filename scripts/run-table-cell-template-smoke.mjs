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
  await page.select('[aria-label="Template"]', 'step');
  await page.locator(field).fill('भू + तिप्');
  await page.waitForFunction(() => document.querySelector('tbody td')?.textContent.includes('भू + तिप्'));
  assert.equal(await page.$eval('tbody td > div', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.$$eval('table button', buttons => buttons.some(button => /Fill fields|Fill column|Use template/.test(button.textContent))), false);
  assert.equal(await page.$eval('[aria-label="Column 1 name"]', el => el.value), 'Column 0');
  assert.equal(await page.$eval('[aria-label="Row 1 label"]', el => el.value), 'prathama');
  assert.equal(await page.$eval('textarea[aria-label="Row 1, Column 0"]', el => el.value), 'Existing answer');

  // Sections belong to the cell, not the table's three body rows.
  assert.equal(await page.$$eval('[aria-label="Section to fill"] option', options => options.length), 1);
  const addSection = async () => {
    const button = await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Add another section' && el.getBoundingClientRect().width));
    await button.asElement().click();
  };
  await addSection();
  await page.locator(field).fill('भवति');
  await addSection();
  await page.locator(field).fill('third');
  await addSection();
  await page.locator(field).fill('fourth');
  assert.equal(await page.$$eval('tbody tr', rows=>rows.length),3);
  assert.equal(await page.$$eval('[aria-label="Section to fill"] option', options=>options.length),4);
  await page.locator('textarea[aria-label="Row 2, Column 0"]').click();
  await page.select('[aria-label="Template"]', 'step');
  assert.equal(await page.$$eval('[aria-label="Section to fill"] option', options=>options.length),1);
  await page.locator(field).fill('गम्');
  await page.locator(cell(0,0)).click();
  assert.equal(await page.$$eval('[aria-label="Section to fill"] option', options=>options.length),4);
  assert.equal(await page.$eval(field, el=>el.value),'भू + तिप्');
  const options = await page.$$eval('[aria-label="Section to fill"] option', options=>options.map(el=>el.value));
  await page.select('[aria-label="Section to fill"]', options[1]);
  assert.equal(await page.$eval(field, el=>el.value),'भवति');
  assert.equal(await page.$$eval('tbody td[rowspan]', cells=>cells.length),0);
  assert.equal(await page.$$eval('tbody td', cells=>cells.length),9);
  await page.locator('summary').filter(el => el.textContent === 'Reorder or move sections').click();
  const move = await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Move up' && el.getBoundingClientRect().width));
  await move.asElement().click();
  assert.equal(await page.$eval(field, el=>el.value),'भवति');
  assert.equal(await page.$eval('[aria-label="Section to fill"] option', el=>el.value),options[1]);
  await page.screenshot({path:'.tmp/independent-cells.png'});
  // Wait for guest-board autosave, then verify persisted values by clicking a cell.
  await new Promise(resolve => setTimeout(resolve, 2200));
  await page.reload({ waitUntil: "networkidle0" });
  await page.locator(cell(0, 0)).click();
  await page.select('[aria-label="Section to fill"]', options[1]);
  assert.equal(await page.$eval(field, el => el.value), 'भवति');
  // Simulate the previously shipped column-wide format and verify automatic recovery.
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('manojalam-guest-boards', 1); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite');
      tx.oncomplete = resolve; tx.onerror = reject;
      const store = tx.objectStore('boards');
      const request = store.get('guest-column-fill');
      request.onsuccess = () => {
        const board = request.result;
        const table = board.content.nodes[0].data.table;
        table.columns[0].card = table.rows[0].templates.c0;
        delete table.rows[0].templates.c0;
        store.put(board);
      };
    });
    db.close();
  });
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$$eval('tbody td', cells => cells.length), 9);
  assert.equal(await page.$$eval('tbody td[rowspan]', cells => cells.length), 0);
  await page.locator(cell(0, 0)).click();
  assert.equal(await page.$$eval('[aria-label="Section to fill"] option', options => options.length), 4);
  await page.locator(cell(1, 0)).click();
  assert.equal(await page.$eval(field, el => el.value), 'गम्');
  assert.equal(await page.$('[aria-label="Column to fill"]'), null);
  assert.equal(await page.$$eval('h3', elements => elements.some(el => /Fill column|Fill cell/.test(el.textContent))), false);
  assert.deepEqual(errors, []);
  console.log('PASS independent cell sections, unchanged table rows, preserved text/styles, and reload');
} finally {
  await browser.close();
}

