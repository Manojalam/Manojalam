import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3093";
const browser = await puppeteer.launch({executablePath: process.env.BOARD_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless:true});
const page = await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const cell = n => `[data-row="r0"][data-column="c${n}"][role="group"]`;
const button = async name => { const h=await page.waitForFunction(name=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===name && el.getBoundingClientRect().width),{},name); await h.asElement().click(); };
try {
  await page.setViewport({width:1800,height:1050});
  await page.goto(base);
  await page.evaluate(async()=>{
    const template={id:'prakriya',name:'Prakriya',rows:[{id:'form',indent:0,collapsible:true,collapsedByDefault:true,fields:[{id:'form',label:'Form',kind:'text',color:'#be185d'}]},{id:'steps',indent:1,collapseParentId:'form',fields:[{id:'steps',label:'Steps',kind:'multiline',color:'#2563eb'}]}],style:{fillColor:'',borderColor:'',textColor:'#111111',fontSize:22,lineSpacing:1.5,width:600}};
    const sections=[{id:'first',values:{form:{text:'भवति'},steps:{text:'भू + तिप्\nभू + शप् + ति'}},extraRows:[]},{id:'second',values:{form:{text:'भवतः'},steps:{text:'भू + तस्'}},extraRows:[]}];
    const table={columns:[{id:'c0',name:'एकवचनम्'},{id:'c1',name:'द्विवचनम्'}],rows:[{id:'r0',cells:['',''],templates:{c0:{template,sections,independent:true},c1:{template,sections,independent:true}}}]};
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result)});
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-collapse',title:'Collapse rows',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'table',type:'table',position:{x:60,y:160},style:{width:900,height:240},data:{table}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}})});db.close();
  });
  await page.goto(base+'/app/boards/guest-collapse',{waitUntil:'networkidle0'});
  const first=cell(0)+' [data-template-toggle]';
  await page.waitForSelector(first);
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$eval(cell(0)+' p[data-template-parent]',el=>getComputedStyle(el).display),'none');
  await page.click(first);
  await page.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-expanded')==='true',{},first);
  assert.notEqual(await page.$eval(cell(0)+' p[data-template-parent]',el=>getComputedStyle(el).display),'none');
  assert.equal(await page.$eval(cell(1)+' [data-template-toggle]',el=>el.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$$eval(cell(0)+' [data-template-toggle]',els=>els[1].getAttribute('aria-expanded')),'false');
  // Keyboard accessible, with controls excluded from capture.
  await page.focus(first); await page.keyboard.press('Enter');
  await page.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-expanded')==='false',{},first);
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'false');
  await page.click(first);
  assert.equal(await page.$eval(first,el=>el.hasAttribute('data-export-ignore')),true);
  await new Promise(r=>setTimeout(r,2200));
  await page.reload({waitUntil:'networkidle0'});
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'true');
  assert.match(await page.$eval(cell(0),el=>el.textContent),/भू \+ शप् \+ ति/);
  // Designer exposes persisted grouping; template text edits must not reset this instance's open state.
  await page.click('.react-flow__node[data-id="table"]');
  await page.click('[aria-label="Create and navigate"] [aria-label="Templates"]');
  await button('Back to templates');
  await button('Edit template');
  await page.$$eval('summary',els=>els.filter(el=>el.textContent==='Collapse / expand').forEach(el=>el.click()));
  assert.equal(await page.$eval('[aria-label="Row 1 expandable heading"]',el=>el.checked),true);
  assert.equal(await page.$eval('[aria-label="Row 2 expandable parent"]',el=>el.value),'form');
  await page.click('[aria-label="Row 1 align center"]');
  await button('Save template');
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'true');
  assert.equal(await page.$eval(cell(1)+' [data-template-toggle]',el=>el.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$$eval(cell(0)+' p[data-template-section-separator]',els=>els.length),1);
  // The same interaction works in an ordinary object, independently of the table.
  await new Promise(r=>setTimeout(r,2200));
  await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onsuccess=()=>resolve(r.result)});
    const board=await new Promise(resolve=>{const r=db.transaction('boards').objectStore('boards').get('guest-collapse');r.onsuccess=()=>resolve(r.result)});
    const card=board.content.nodes[0].data.table.rows[0].templates.c0;
    board.content.nodes.push({id:'shape',type:'shape',position:{x:1050,y:160},style:{width:350,height:280},data:{shapeType:'rounded',fillColor:'#ffffff',cardTemplateId:card.template.id,cardTemplateSnapshot:card.template,cardSections:card.sections,richText:card.sections.map(section=>section.editedText.html).join('<p data-template-section-separator="true"><br></p>')}});
    await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put(board)});db.close();
  });
  await page.reload({waitUntil:'networkidle0'});
  const shape='.react-flow__node[data-id="shape"] [data-template-toggle]';
  assert.equal(await page.$eval(shape,el=>el.getAttribute('aria-expanded')),'true');
  await page.click(shape);
  await page.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-expanded')==='false',{},shape);
  assert.equal(await page.$eval(first,el=>el.getAttribute('aria-expanded')),'true');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'.tmp/template-collapse.png'});
  console.log('PASS independent cell/section collapse, keyboard toggle, retained values, reload, designer and template update');
} catch(e) { await page.screenshot({path:'.tmp/template-collapse-failure.png'}); throw e; } finally {await browser.close();}
