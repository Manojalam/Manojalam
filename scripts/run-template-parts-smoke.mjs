// Start the app; BOARD_TEST_URL and BOARD_TEST_BROWSER override local defaults.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const button = async name => {
  const handle = await page.waitForFunction(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getBoundingClientRect().width), {}, name);
  await handle.asElement().click();
};
const templates = () => page.click('[aria-label="Create and navigate"] [aria-label="Templates"]');
try {
  await page.setViewport({width:1600,height:1000});
  await page.goto(base);
  await page.evaluate(async()=>{const card={id:'step',name:'Derivation step',rows:[{id:'step-row',indent:0,fields:[{id:'expression',label:'Expression',kind:'text',color:'#ef4444'},{id:'sutra',label:'Sutra',kind:'sutra',color:'#2563eb'}]}],style:{fillColor:'#fff8dc',textColor:'#111111',fontSize:18,lineSpacing:1.5,width:400}};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});
  r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');
  tx.oncomplete=resolve;
  tx.objectStore('boards').put({id:'guest-text-template',title:'Table template sizing',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'target',type:'shape',position:{x:50,y:100},style:{width:500,height:260},data:{shapeType:'rounded',autoSizeMode:'fixed',fillColor:'#123456',borderColor:'#ff9900',borderWidth:5,textPadding:11,fillOpacity:0.8}}],edges:[],settings:{cardTemplates:[card]},viewport:{x:0,y:0,zoom:0.8}}});
  });
  db.close()});
  

  await page.goto(`${base}/app/boards/guest-text-template`, {waitUntil:'networkidle0'});
  await page.click('.react-flow__node[data-id="target"]');
  await templates();
  await button('Edit template');
  await page.select('[aria-label="Expression field type"]', 'multipart');
  await button('Add part');
  await page.locator('[aria-label="Part 2 label"]').fill('Marker');
  await page.select('[aria-label="Part 2 type"]', 'constant');
  await page.locator('[aria-label="Part 2 constant text"]').fill(' + ');
  await button('Add part');
  await page.locator('[aria-label="Part 3 label"]').fill('Part sutra');
  await page.select('[aria-label="Part 3 type"]', 'sutra');
  await button('Save template');
  await button('Use in selected object');
  assert.equal(await page.$$eval('[data-card-fill-panel] label', els=>els.some(el=>el.textContent==='Marker')),false);
  await page.locator('#card-field-expression').fill('भू + तिप्');
  await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="target"] .tiptap').textContent.includes('भू + तिप् + '));
  await page.focus('#card-field-expression');
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await page.waitForFunction(()=>!(document.querySelector('.react-flow__node[data-id="target"] .tiptap')?.textContent ?? '').includes('+'));
  await page.locator('#card-field-expression').fill('भू');
  await new Promise(resolve => setTimeout(resolve,2200));
  const saved = await page.evaluate(async () => {
    const db = await new Promise(resolve => {const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
    const value = await new Promise(resolve => {const r=db.transaction('boards').objectStore('boards').get('guest-text-template');r.onsuccess=()=>resolve(r.result)});
    db.close();return value.content;
  });
  const node = saved.nodes.find(node=>node.id==='target');
  for (const [key,value] of Object.entries({fillColor:'#123456',borderColor:'#ff9900',borderWidth:5,textPadding:11,fillOpacity:0.8})) assert.equal(node.data[key],value);
  assert.equal(node.style.width,500);


  assert.match(node.data.richText,/भू/);
  const group=saved.settings.cardTemplates[0].rows[0].fields.find(field=>field.kind==='multipart');
  const constant=group.parts.find(part=>part.kind==='constant');
  assert.equal(group.parts[0].id,'expression');
  assert.equal(group.parts[2].kind,'sutra');
  assert.equal(await page.$$eval('[aria-label="Find sūtra for Part sutra"]', els=>els.length),1);
  assert.equal(constant.constantText,' + ');

  assert.deepEqual(errors,[]);
  console.log('PASS multipart designer, persisted typed parts, scoped constants and sutra lookup input');
} finally { await browser.close(); }

