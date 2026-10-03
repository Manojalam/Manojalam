import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import puppeteer from "puppeteer-core";
import { PDFDocument, PDFName } from "pdf-lib";

const output = path.resolve(".tmp/symbol-export-smoke");
mkdirSync(output, { recursive: true });
const executablePath = process.env.PDF_CHROMIUM_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const font = readFileSync(process.env.SYMBOL_TEST_FONT ?? "C:/Windows/Fonts/arial.ttf").toString("base64");
const fontCss = `@font-face{font-family:SmokeText;src:url(data:font/ttf;base64,${font})}`;
const browser = await puppeteer.launch({ executablePath, headless: true });
let html;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 600, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><head><style>${fontCss}
    body{margin:20px;background:white}#original{width:960px;font:32px SmokeText;color:#138c3c}
    p{margin:10px 0}a{color:#a21caf}.enclosed{display:inline-flex;border:2px solid #c22;border-radius:50%;padding:6px;transform:scale(1.1)}
    svg{display:block;width:800px;height:120px}
  </style></head><body><div id="original">
    <p>Checks ✓ ✔ ☑ ✅ and crosses ✕ ✖ ✗ ✘ ❌ ☒</p>
    <p>Flowers ❀ ✿ ❁ ✾ ❃ 🌼 🌸 🌺 🌻 🌹 🪷 💐</p>
    <p><a href="https://example.com"><span class="enclosed">❁</span> linked ✓</a> Ordinary text</p>
    <svg xmlns="http://www.w3.org/2000/svg"><text x="20" y="50" font-size="32" fill="#772233" transform="rotate(3 20 50)">SVG ✓ ❌ 🌸 <tspan fill="#1565c0">❁ end</tspan></text></svg>
  </div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const helper = ts.transpileModule(readFileSync("src/lib/export/symbol-assets.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  await page.addScriptTag({ content: `(()=>{const exports={};${helper};window.embedExportSymbolImages=exports.embedExportSymbolImages;})();` });
  const result = await page.evaluate(async () => {
    const source = document.querySelector("#original");
    const clone = source.cloneNode(true);
    clone.id = "exported";
    const sources = [source, ...source.querySelectorAll("*")];
    const copies = [clone, ...clone.querySelectorAll("*")];
    sources.forEach((element, index) => {
      const style = getComputedStyle(element);
      for (const property of style) copies[index].style.setProperty(property, style.getPropertyValue(property));
    });
    sources.forEach((element, index) => window.embedExportSymbolImages(element, copies[index]));
    document.body.replaceChildren(clone);
    // Exported assets must stay independent of the font assigned in the destination.
    clone.querySelectorAll("*").forEach((element) => element.style.setProperty("font-family", "SmokeText", "important"));
    await Promise.all([...clone.querySelectorAll("img")].map((image) => image.decode()));
    const assets = [...clone.querySelectorAll("[data-export-symbol]")];
    const pixelCounts = await Promise.all(assets.map(async (element) => {
      const image = new Image();
      image.src = element.getAttribute("src") ?? element.getAttribute("href");
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) visible++;
      return visible;
    }));
    return {
      count: assets.length, svgCount: clone.querySelectorAll("image[data-export-symbol]").length,
      pixelCounts, originalUnchanged: source.querySelectorAll("img,image").length === 0,
      html: `<!doctype html><html><head><style>@page{size:800pt 420pt;margin:0}body{margin:20px;background:white}</style></head><body>${clone.outerHTML}</body></html>`,
    };
  });
  assert.equal(result.count, 28);
  assert.equal(result.svgCount, 4);
  assert.ok(result.pixelCounts.every((count) => count > 100));
  assert.ok(result.originalUnchanged);
  html = result.html.replace("<style>", `<style>${fontCss}`);
  await page.screenshot({ path: path.join(output, "symbols.png") });
} finally { await browser.close(); }

// Exercise the actual locked-down PDF renderer: the server cannot fetch fonts
// or images, so every symbol must travel as an embedded data image.
process.env.PDF_CHROMIUM_EXECUTABLE_PATH = executablePath;
for (const name of ["pdf-source-text", "server-pdf"]) {
  const source = readFileSync(`src/lib/export/${name}.ts`, "utf8").replace('"./pdf-source-text"', '"./pdf-source-text.mjs"');
  writeFileSync(path.join(output, `${name}.mjs`), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText);
}
const { renderBoardPdf } = await import(pathToFileURL(path.join(output, "server-pdf.mjs")));
const bytes = await renderBoardPdf(html);
writeFileSync(path.join(output, "symbols.pdf"), bytes);
const pdf = await PDFDocument.load(bytes);
assert.equal(pdf.getPageCount(), 1);
const images = pdf.context.enumerateIndirectObjects().filter(([, object]) => object.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image");
assert.ok(images.length >= 20, "PDF must contain embedded symbol artwork.");
console.log("PASS: HTML and SVG symbols become nonempty embedded images; original text is untouched; locked-down PDF renderer embeds the artwork on one page.");
