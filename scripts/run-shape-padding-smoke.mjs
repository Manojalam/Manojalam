// Start the app; BOARD_TEST_URL and BOARD_TEST_BROWSER override local defaults.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const button = async name => {
  const handle = await page.waitForFunction(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label && el.getBoundingClientRect().width), {}, name);
  await handle.asElement().click();
};

try {
  await page.setViewport({width:1600,height:1000});
  await page.goto(base+'?kind='+(process.env.PADDING_KIND || 'shape')+'&layout='+(process.env.PADDING_LAYOUT || '')+'&template='+(process.env.PADDING_TEMPLATE || ''));
  await page.evaluate(async()=>{const card={id:'step',name:'Derivation step',rows:[{id:'step-row',indent:0,fields:[{id:'expression',label:'Expression',kind:'text',color:'#ef4444'},{id:'sutra',label:'Sutra',kind:'sutra',color:'#2563eb'}]}],style:{fillColor:'#fff8dc',textColor:'#111111',fontSize:18,lineSpacing:1.5,width:400}};
  const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});
  r.onsuccess=()=>resolve(r.result)});
  await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');
  tx.oncomplete=resolve;
  tx.objectStore('boards').put({id:'guest-text-template',title:'Table template sizing',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'target',type:(new URL(location.href)).searchParams.get('kind') || 'shape',position:{x:50,y:100},style:{width:500,height:260},data:{text:'Padding test text',layoutMode:(new URL(location.href)).searchParams.get('layout') || undefined,cardTemplateId:(new URL(location.href)).searchParams.get('template') || undefined,shapeType:'rounded',autoSizeMode:'fixed',fillColor:'#123456',borderColor:'#ff9900',borderWidth:5,textPadding:11,fillOpacity:0.8}}],edges:[],settings:{cardTemplates:[card]},viewport:{x:0,y:0,zoom:0.8}}});
  });
  db.close()});
  

  await page.goto(`${base}/app/boards/guest-text-template`, {waitUntil:'networkidle0'});
  await page.click('.react-flow__node[data-id="target"]');
  const properties = await page.$('[aria-label="Object properties"]'); if (properties) await properties.click();
  await page.click('[role="tab"]::-p-text(Shape)');
  const paddingInput = await page.waitForFunction(() => {
    const title = [...document.querySelectorAll('p')].find(el => el.textContent.trim() === 'Shape padding' && el.getBoundingClientRect().width);
    return title?.parentElement.parentElement.querySelector('input[type="number"]');
  });
  await paddingInput.asElement().focus();
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await page.keyboard.type('24'); await page.keyboard.press('Enter');
  if (!(await page.$('.react-flow__node-shape[data-id="target"]'))) {
    await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node[data-id="target"] *')].some(el => getComputedStyle(el).paddingLeft === '24px'));
  }
  await page.waitForFunction(() => document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  const saved = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r=indexedDB.open('manojalam-guest-boards',1); r.onsuccess=()=>resolve(r.result); });
    return new Promise(resolve=>{ const r=db.transaction('boards').objectStore('boards').get('guest-text-template'); r.onsuccess=()=>resolve(r.result.content.nodes.find(n=>n.id==='target').data.textPadding); });
  });
  assert.equal(saved,24);
  assert.deepEqual(errors,[]);
  console.log('PASS:', process.env.PADDING_KIND || 'shape', process.env.PADDING_LAYOUT || '', process.env.PADDING_TEMPLATE || '', 'Shape tab, 24px padding, persistence.');
} finally { await browser.close(); }
