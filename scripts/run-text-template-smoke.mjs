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
  await button('Create template');
  await page.waitForSelector('[role="dialog"]');
  assert.equal(await page.$$eval('[role="dialog"] [aria-label="Card width"]', els => els.length), 0);
  assert.equal(await page.$$eval('[role="dialog"] button[aria-label*="Background"]', els => els.length), 0);
  await page.locator('[role="dialog"] [aria-label="Template name"]').fill('New text pattern');
  await button('Save template');
  await page.select('[aria-label="Template"]', 'step');
  await button('Use in selected object');
  await page.locator('#card-field-expression').fill('भू + तिप्');
  await templates();
  await button('Edit template');
  await page.locator('[role="dialog"] [aria-label="Font size"]').fill('30');
  await page.locator('[role="dialog"] [aria-label="Line spacing"]').fill('1.75');
  await button('Save template');
  await new Promise(resolve => setTimeout(resolve,2200));
  const saved = await page.evaluate(async () => {
    const db = await new Promise(resolve => {const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
    const value = await new Promise(resolve => {const r=db.transaction('boards').objectStore('boards').get('guest-text-template');r.onsuccess=()=>resolve(r.result)});
    db.close();return value.content;
  });
  const node = saved.nodes.find(node=>node.id==='target');
  for (const [key,value] of Object.entries({fillColor:'#123456',borderColor:'#ff9900',borderWidth:5,textPadding:11,fillOpacity:0.8})) assert.equal(node.data[key],value);
  assert.equal(node.style.width,500);
  assert.match(node.data.richText,/font-size: 30px/);
  assert.match(node.data.richText,/line-height: 1.75/);
  assert.match(node.data.richText,/भू/);
  assert.ok(saved.settings.cardTemplates.some(template=>template.name==='New text pattern'));
  assert.equal(await page.$eval('.react-flow__node[data-id="target"] .tiptap span[style*="font-size"]', el=>getComputedStyle(el).fontSize),'30px');
  await page.screenshot({path:'.tmp/text-templates.png'});
  await button('Create new text');
  await page.waitForSelector('.react-flow__node-text');
  assert.deepEqual(errors,[]);
  console.log('PASS direct template creation, text-only designer, preserved object styling through fill/redesign, and new text object');
} finally { await browser.close(); }

