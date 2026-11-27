import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:0,fields:[{id:'group',label:'Parts',kind:'multipart',color:'#ffffff',parts:[{id:'answer',label:'Answer',kind:'text',color:'#ffffff'},{id:'last',label:'Last part',kind:'text',color:'#ffffff'}]}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'neighbor',type:'shape',position:{x:150,y:600},style:{width:500,height:150},data:{text:'Neighbor',shapeType:'rectangle'}},{id:'object',type:'shape',position:{x:150,y:150},style:{width:400,height:300},data:{text:'Open documentation',href:'https://example.com/docs',cardTemplateId:template.id,cardTemplateSnapshot:template,cardSections:sections}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});
 await page.click('[data-id="object"]');
 await page.waitForFunction(()=>document.activeElement?.matches('[data-id=object] [contenteditable=true]'));



 const selector='[data-id="object"] .react-flow__resize-control.handle.bottom.right';
 await page.waitForSelector(selector);
 const box=await (await page.$(selector)).boundingBox();
 const target=await page.$eval('[data-id="neighbor"]',e=>e.getBoundingClientRect().right);
 const before=await page.$eval('[data-id="object"]',e=>e.getBoundingClientRect().width);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(target,box.y+box.height/2+50,{steps:12});
 await page.waitForSelector('[data-alignment-guide="vertical"]');
 assert.ok(await page.$$eval('[data-alignment-guide="vertical"]',(els,x)=>els.some(e=>Math.abs(e.getBoundingClientRect().left-x)<8),target));
 await page.mouse.up();
 await page.waitForFunction(()=>!document.querySelector('[data-alignment-guide]'));
 assert.ok(await page.$eval('[data-id="object"]',e=>e.getBoundingClientRect().width)>before+50);
 console.log('PASS: resize displays neighboring edge guides and clears on release without blocking resize');
} finally {await browser.close();}
