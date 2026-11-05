import assert from "node:assert/strict";
import sharp from "sharp";
import puppeteer from "puppeteer-core";
const base = process.env.BOARD_TEST_URL ?? "http://localhost:3095";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
page.on("dialog", d => d.accept());
try {
  await page.setViewport({ width: 1800, height: 950 });
  await page.goto(base);
  await page.evaluate(async () => {
    const types = ["shape", "text", "sticky", "table", "sanskrit", "grammar", "shloka", "frame", "shape", "text", "relationshipDiagram"];
    const nodes = types.map((type, i) => ({ id: "paint-"+i, type, position:{x:30+(i%5)*270,y:40+Math.floor(i/5)*250}, style:{width:240,height:180}, data:{text:type, topic:type, devanagari:type, title:type, verse:type, shapeType:i===8?"hexagon":"rectangle", textFrameStyle:i===9?"speech":"plain", fillColor:"#bfbfff",fillOpacity:1,surfaceEffects:[{preset:"raised"},{preset:"metallic"}],layoutAutoFill:false} }));
    const request = indexedDB.open("manojalam-guest-boards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("boards", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction("boards", "readwrite"); tx.oncomplete = resolve;
      tx.objectStore("boards").put({ id: "guest-fold-panel", title: "Matrix fold panel", storageMode: "local", accessRole: "owner", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), content: { nodes, edges: [], settings: {}, viewport: { x: 0, y: 0, zoom: 1 } } });
    }); db.close();
  });
  await page.goto(base + "/app/boards/guest-fold-panel", { waitUntil: "networkidle0" });
  const check = async () => {
    for (let i=0;i<11;i++) {
      await page.waitForSelector(`.react-flow__node[data-id="paint-${i}"]`);
      const styles = await page.$$eval(`.react-flow__node[data-id="paint-${i}"] *`, els=>els.map(el=>({fill:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage})));
      assert.ok(styles.some(s=>s.fill==='rgb(191, 191, 255)' && s.image.includes('linear-gradient')), `paint-${i} must retain purple below effects`);
    }
  };
  await check();
  for (const i of [8,9]) {
    const svg = await page.$(`.react-flow__node[data-id="paint-${i}"] svg:has(foreignObject)`);
    assert.ok(svg, `SVG paint surface ${i} exists`);
    const exportedPixel = await svg.evaluate(async el => {
      const xml = new XMLSerializer().serializeToString(el);
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width=240;canvas.height=180;
      const context=canvas.getContext('2d');context.drawImage(image,0,0,240,180);
      return Array.from(context.getImageData(96,81,1,1).data);
    });
    assert.ok(exportedPixel[0]>90 && exportedPixel[2]>140 && exportedPixel[3]>200, `SVG ${i} exported paint remains visible`);
    const {data,info} = await sharp(await svg.screenshot()).raw().toBuffer({resolveWithObject:true});
    const offset = (Math.floor(info.height*0.45)*info.width+Math.floor(info.width*0.4))*info.channels;
    assert.ok(data[offset]>90 && data[offset+2]>140, `SVG ${i} must visibly paint purple, not the dark board`);
  }
  await page.screenshot({path:'.tmp/object-paint-audit.png'});
  await page.reload({waitUntil:'networkidle0'});
  await check();
  console.log('PASS: authored fill + combined effects on shapes, text, sticky, table, Sanskrit, grammar, shloka, frame, relationship background, SVG polygon and callout; reload retained paint.');
} finally { await browser.close(); }
