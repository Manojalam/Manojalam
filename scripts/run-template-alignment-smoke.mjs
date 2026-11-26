import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const base = process.env.BOARD_TEST_URL ?? 'http://localhost:3095';
try {
 await page.setViewport({width:1500,height:1000}); await page.goto(base);
 await page.evaluate(async()=>{
 const template={id:'clear-test',name:'Clear test',rows:[{id:'r',indent:2,textAlign:'center',fields:[{id:'answer',label:'Answer',kind:'link',color:'#ffffff'}]}],style:{fillColor:'',borderColor:'',textColor:'#ffffff',fontSize:22,lineSpacing:1.5,width:400}};
 const sections=[{id:'one',values:{answer:{text:'Open documentation',href:'https://example.com/docs'}},extraRows:['Extra note'],rowRepeats:[{id:'rep',rowId:'r',values:{answer:{text:'Repeated value'}}}]},{id:'two',values:{answer:{text:'Second section'}},extraRows:[]}];
 const edited='<p data-template-row="[&quot;one&quot;,&quot;r&quot;]" style="text-align:left;padding-left:0em;text-indent:4em"><strong>Edited text kept</strong></p>';
 sections[0].editedText={html:edited,baseline:edited};
 const db=await new Promise(resolve=>{const r=indexedDB.open('manojalam-guest-boards',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction('boards','readwrite');tx.oncomplete=resolve;tx.objectStore('boards').put({id:'guest-clear-template',title:'Clear test',storageMode:'local',accessRole:'owner',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),content:{nodes:[{id:'object',type:'table',position:{x:150,y:150},style:{width:400,height:500},data:{table:{columns:[{id:'col',name:'Target'}],rows:[{id:'row',cells:['Old duplicate below'],richCells:{col:'<p>Old duplicate below</p>'},templates:{col:{template,sections,independent:true}}}]},text:'Open documentation',href:'https://example.com/docs'}}],edges:[],settings:{cardTemplates:[template]},viewport:{x:0,y:0,zoom:1}}});});db.close();
 });
 await page.goto(base+'/app/boards/guest-clear-template',{waitUntil:'networkidle0'});




 await page.waitForSelector('[data-cell-row="row"] [data-template-row]');
 const rows=await page.$$eval('[data-cell-row="row"] [data-template-row]',els=>els.map(e=>({align:getComputedStyle(e).textAlign,indent:parseFloat(getComputedStyle(e).paddingLeft),first:parseFloat(getComputedStyle(e).textIndent),text:e.textContent})));
 assert.ok(rows.length>=2);
 for(const row of rows){assert.equal(row.align,'center');assert.ok(row.indent>0);assert.equal(row.first,0);}
 assert.ok(rows.some(row=>row.text.includes('Edited text kept')));
 console.log('PASS: edited and unedited template paragraphs follow template alignment/indent without losing text');
} finally {await browser.close();}
