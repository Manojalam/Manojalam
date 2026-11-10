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
  await button('Use in selected object');
  const choose = async number => {
    await page.locator('[aria-label="Find sūtra for Sutra"]').fill(number);
    await page.waitForSelector('[role="option"]');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  };
  await choose('1.3.1');
  const first=await page.$eval('#card-field-sutra',el=>el.textContent);
  assert.equal(await page.$eval('#card-field-sutra a',el=>el.href),'https://ashtadhyayi.com/sutraani/1/3/1');
  assert.equal(await page.$eval('.react-flow__node[data-id="target"] .tiptap a',el=>el.href),'https://ashtadhyayi.com/sutraani/1/3/1');
  await choose('3.2.123');
  const both=await page.$eval('#card-field-sutra',el=>el.textContent);
  assert.ok(both.startsWith(first+', '));
  const second=both.slice(first.length+2);
  assert.ok(second.length>0);
  const links=await page.$$eval('.react-flow__node[data-id="target"] .tiptap a',els=>els.map(el=>el.href));
  assert.ok(links.includes('https://ashtadhyayi.com/sutraani/1/3/1'));
  assert.ok(links.includes('https://ashtadhyayi.com/sutraani/3/2/123'));
  await page.focus('#card-field-sutra');
  await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');
  await page.keyboard.sendCharacter(second);
  await choose('1.3.1');
  assert.equal(await page.$eval('#card-field-sutra',el=>el.textContent),second+', '+first);
  await page.waitForFunction(()=>document.body.innerText.includes('Saved on this device'));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(text=>document.querySelector('.react-flow__node[data-id="target"]')?.textContent.includes(text),{},second+', '+first);
  assert.deepEqual(errors,[]);
  console.log('PASS: keyboard lookup appends comma-separated sutras with separate links, respects manual edits, and persists after reload.');
} finally { await browser.close(); }

