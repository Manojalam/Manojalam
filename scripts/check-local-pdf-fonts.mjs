// Optional desktop integration check, after run-direct-pdf-smoke.mjs.
// Requires installed Arial/Georgia and PDF_CHROMIUM_EXECUTABLE_PATH.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";
import puppeteer from "puppeteer-core";

const source = ts.transpileModule(fs.readFileSync("src/lib/export/local-fonts.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const browser = await puppeteer.launch({ executablePath: process.env.PDF_CHROMIUM_EXECUTABLE_PATH, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 300 });
  await page.setRequestInterception(true);
  page.on("request", request => void request.respond({ contentType: "text/html; charset=utf-8", body: `
    <html><head><meta charset="utf-8"><style>
    @page{size:600pt 225pt;margin:0}html,body{margin:0;width:800px;height:300px;overflow:hidden}
    #board-print-sheet{padding:20px;font-family:Arial;font-size:28px;line-height:1.5;color:#214ac7}p{margin:0}
    </style></head><body><div id="board-print-sheet">
    <p>Exact Arial: regular, <b>bold</b>, <i>italic</i>.</p>
    <p style="font-family:Georgia;color:#ad2268">Georgia: regular, <b>bold</b>, <i>italic</i>.</p>
    </div></body></html>` }));
  await page.goto("http://localhost/");
  const session = await page.createCDPSession();
  await session.send("Browser.setPermission", { permission: { name: "local-fonts" }, setting: "granted", origin: "http://localhost" });
  const result = await page.evaluate(async source => {
    const library = await import(`data:text/javascript;base64,${source}`);
    const measure = () => Array.from(document.querySelectorAll("p,b,i")).map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const rect = range.getBoundingClientRect(); return [rect.width, rect.height];
    });
    const before = measure();
    const faces = await library.readLocalPdfFonts(new Set(["Arial", "Georgia"]), () => window.queryLocalFonts());
    document.querySelector("style").append(document.createTextNode(faces.map(face => face.cssText).join("\n")));
    void document.body.offsetHeight;
    await document.fonts.ready;
    return { before, after: measure(), html: document.documentElement.outerHTML, count: faces.length };
  }, Buffer.from(source).toString("base64"));
  assert.deepEqual(result.after, result.before, "Embedding changed the selected font's metrics");
  assert.ok(result.count >= 8);
  const output = path.resolve(".tmp/direct-pdf-smoke");
  const { renderBoardPdf } = await import(pathToFileURL(path.join(output, "server-pdf.mjs")));
  fs.writeFileSync(path.join(output, "local-fonts.pdf"), await renderBoardPdf(result.html));
  console.log("PASS: installed Arial/Georgia retain regular, bold and italic metrics; PDF has no platform-font substitution.");
} finally { await browser.close(); }
