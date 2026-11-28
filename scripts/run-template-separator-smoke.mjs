import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--outDir','.tmp/separator-test','--module','commonjs','--moduleResolution','node','--target','ES2022','--esModuleInterop','--skipLibCheck','src/lib/canvas/template-value-html.ts'],{stdio:'inherit'});
assert.equal(result.status,0);
const source=readFileSync('.tmp/separator-test/template-value-html.js','utf8');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();
 const results=await page.evaluate(source=>{
  const exports={};new Function('exports','require',source)(exports,()=>({}));
  const field=(id,text)=>`<span data-field-instance='["one","rep","${id}"]' data-field-label="${id}">${text}</span>`;
  const d=field('dhatu','पठ्'),p=field('pratyaya','याद्'),plus=field('plus',' + ');
  const old=`<p>${d}</p>`,full=`<p>${d}${plus}${p}</p>`;
  const run=(html,baseline,generated)=>exports.refreshEditedTemplate(html,baseline,generated,new Set(['plus']));
  const text=html=>new DOMParser().parseFromString(html,'text/html').body.textContent;
  const late=run(old,old,full);
  const repaired=run(`<p><em>Note: </em>${d}${p}</p>`,full,full);
  const cleared=run(repaired,full,old);
  const again=run(repaired,full,full);
  const order=run(`<p>${d}</p>`,old,`<p>${d}${plus}${p}${field('sutra',' [rule]')}</p>`);
  return {late:text(late),repaired:text(repaired),keptNote:repaired.includes('<em>Note: </em>'),cleared:text(cleared),again:text(again),order:text(order)};
 },source);
 assert.equal(results.late,'पठ् + याद्');assert.equal(results.repaired,'Note: पठ् + याद्');assert.equal(results.keptNote,true);
 assert.equal(results.cleared,'Note: पठ्');assert.equal(results.again,results.repaired);assert.equal(results.order,'पठ् + याद् [rule]');
 console.log('PASS: late pratyaya restores +; stale edited snapshots repair; clear removes conditional constant; notes survive; refresh does not duplicate separator');
}finally{await browser.close();}

