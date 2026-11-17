// Start the app; BOARD_TEST_URL and BOARD_TEST_BROWSER override local defaults.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
const browser = await puppeteer.launch({ executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
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
  await page.waitForSelector('.react-flow__node[data-id="target"].selected');
  const editor = '.react-flow__node[data-id="target"] .tiptap';
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("vidya:edit-node", {detail:{nodeId:"target"}})));
  await page.waitForSelector(editor+'[contenteditable="true"]');
  const replace = async text => {
    await page.focus(editor);
    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
    await page.keyboard.type(text);
  };
  await replace('- ');
  assert.equal(await page.$eval(editor,el=>el.textContent.replace(/\u00a0/g, ' ')), '- ');
  assert.equal(await page.$(editor+' ul'), null);
  await page.keyboard.type('first'); await page.keyboard.press('Enter'); await page.keyboard.type('- second');
  assert.equal(await page.$(editor+' ul'), null);
  assert.match(await page.$eval(editor,el=>el.textContent), /- first.*- second/);
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('8'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForSelector(editor+' ul');
  // Return to ordinary paragraphs before checking the retained star shortcut.
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('8'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await replace('* ');
  await page.waitForSelector(editor+' ul');
  assert.deepEqual(errors,[]);
  console.log('PASS: dash-space stays literal on first and subsequent lines; explicit bullet command and star-space still work.');
} finally { await browser.close(); }
