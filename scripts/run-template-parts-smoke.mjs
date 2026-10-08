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
  assert.equal(await page.$('[aria-label="Part 2 label"]'), null);
  await button('Add part');
  await page.locator('[aria-label="Part 3 label"]').fill('Part sutra');
  await page.select('[aria-label="Part 3 type"]', 'sutra');
  await page.locator('[aria-label="Wrap part 3 in brackets"]').click();
  assert.equal(await page.$eval('[aria-label="Part 3 constant text"]', el => el.value), '[');
  assert.equal(await page.$eval('[aria-label="Part 5 constant text"]', el => el.value), ']');
  assert.equal(await page.$eval('[aria-label="Part 4 type"]', el => el.value), 'sutra');
  await page.screenshot({path:'.tmp/multipart-brackets.png'});
  await page.locator('[aria-label="Part 1 font size"]').fill('28');
  await page.locator('[aria-label="Part 1 bold"]').click();
  await button('Save template');
  await button('Use in selected object');
  assert.equal(await page.$$eval('[data-card-fill-panel] label', els=>els.some(el=>el.textContent==='Marker')),false);
  await page.locator('#card-field-expression').fill('भू + तिप्');
  await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="target"] .tiptap').textContent.includes('भू + तिप् + '));
  await page.focus('#card-field-expression');
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await page.waitForFunction(()=>!(document.querySelector('.react-flow__node[data-id="target"] .tiptap')?.textContent ?? '').includes('+'));
  await page.locator('#card-field-expression').fill('भू');
  const sutraInput = await page.evaluate(() => [...document.querySelectorAll('label[for]')].find(el => el.textContent === 'Part sutra').htmlFor);
  assert.equal(await page.$eval('.react-flow__node[data-id="target"] .tiptap', el => el.textContent.includes('[')), false);
  await page.locator('#' + sutraInput).fill('भुवादयो धातवः १.३.१');
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="target"] .tiptap').textContent.includes('[भुवादयो धातवः १.३.१]'));
  await page.focus('#' + sutraInput);
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await page.waitForFunction(() => !document.querySelector('.react-flow__node[data-id="target"] .tiptap').textContent.includes('['));

  const repeatPlacement = await page.evaluate(() => {
    const row = document.querySelector('[data-card-fill-panel] [aria-label="Row 1"]');
    const after = [...row.querySelectorAll('button')].find(el => el.textContent === 'Repeat after');
    const inputs = row.querySelectorAll('[role=textbox]');
    return after.getBoundingClientRect().top >= inputs[inputs.length - 1].getBoundingClientRect().bottom;
  });
  assert.equal(repeatPlacement, true);
  await button('Repeat after');
  await page.locator('[id^="card-field-expression-"]').fill('भवति');
  await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node[data-id="target"] .tiptap p')].some(el => el.textContent.includes('भवति')));
  assert.equal(await page.$$eval('.react-flow__node[data-id="target"] .tiptap p', els => els.filter(el => el.textContent.trim()).length), 2);
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
  assert.equal(group.parts[0].fontSize,28);
  assert.equal(group.parts[0].bold,true);
  assert.match(node.data.richText,/font-size: 28px/);
  assert.match(node.data.richText,/<strong>भवति<\/strong>/);
  assert.equal(node.data.cardSections[0].rowRepeats[0].newLine,true);
  assert.equal(group.parts[3].kind,'sutra');
  assert.equal(group.parts[2].constantWhenFieldId, group.parts[3].id);
  assert.equal(group.parts[4].constantWhenFieldId, group.parts[3].id);
  assert.equal(await page.$$eval('[aria-label="Find sūtra for Part sutra"]', els=>els.length),2);
  assert.equal(constant.constantText,' + ');


  // Local value formatting affects only the selected words, not the shared template.
  await page.locator('#card-field-expression').fill('भू गम्');
  const selectWord = async (selector, word) => { await page.$eval(selector, (root, word) => {
    root.focus();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(word); if (start < 0) continue;
      const range = document.createRange(); range.setStart(node,start); range.setEnd(node,start+word.length);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return;
    }
    throw new Error('Missing word: '+word);
  },word); await new Promise(resolve=>setTimeout(resolve,100)); };
  await selectWord('#card-field-expression','गम्');
  await page.keyboard.down('Control'); await page.keyboard.press('i'); await page.keyboard.up('Control');
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="target"] em')?.textContent === 'गम्');
  await page.click('button[aria-label="Text color"]');
  await page.click('[aria-label="Exact color"] input[type="text"]');
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await page.keyboard.type('#e83e8c');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.react-flow__node[data-id="target"] em')).color === 'rgb(232, 62, 140)');
  await button('Close');
  const object = '.react-flow__node[data-id="target"] .tiptap';
  await page.click(object + ' [data-field-label="expression"]',{clickCount:2});
  await page.waitForSelector(object+'[contenteditable="true"]');
  await new Promise(resolve=>setTimeout(resolve,100));
  await selectWord(object,'गम्');
  await page.keyboard.down('Control'); await page.keyboard.press('u'); await page.keyboard.up('Control');
  await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node[data-id="target"] u')].some(el=>el.textContent.includes("गम्")));
  await page.focus(object);
  await page.$eval(object, root => { const range = document.createRange(); range.selectNodeContents(root); range.collapse(false); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await new Promise(resolve=>setTimeout(resolve,100));
  await page.keyboard.press('Enter'); await page.keyboard.type(' My own note');
  await page.mouse.click(900,700);
  await new Promise(resolve=>setTimeout(resolve,2000));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="target"] .tiptap')?.textContent.includes('My own note'));
  assert.equal(await page.$eval(object,el=>[...el.querySelectorAll('u')].some(mark=>mark.textContent.includes('गम्'))),true);

  // Change the saved template defaults. Manual formatting must win, other text must still inherit.
  await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
    const board=await new Promise(resolve=>{const r=db.transaction('boards').objectStore('boards').get('guest-text-template');r.onsuccess=()=>resolve(r.result)});
    const part=board.content.settings.cardTemplates[0].rows[0].fields.find(field=>field.kind==='multipart').parts[0];
    part.color='#118833'; part.fontSize=32; part.bold=false;
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put(board)});db.close();
  });
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="target"] em'));
  const styles = await page.$eval(object,root=>{
    const inherited=[...root.querySelectorAll('[data-field-label="expression"]')].find(el=>el.textContent.includes('भवति'));
    const local=root.querySelector('em');
    return {color:getComputedStyle(inherited).color,size:getComputedStyle(inherited).fontSize,weight:getComputedStyle(inherited).fontWeight,local:getComputedStyle(local).color,note:root.textContent.includes('My own note')};
  });
  assert.deepEqual(styles,{color:'rgb(17, 136, 51)',size:'32px',weight:'500',local:'rgb(232, 62, 140)',note:true});
  assert.deepEqual(errors,[]);
  console.log('PASS multipart designer, persisted typed parts, scoped constants and sutra lookup input');
} catch (error) { await page.screenshot({path:".tmp/template-edit-failure.png"}); throw error; } finally { await browser.close(); }

