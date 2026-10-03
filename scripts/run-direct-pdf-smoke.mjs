// Run after npm run build. On Windows/macOS set PDF_CHROMIUM_EXECUTABLE_PATH.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const output = path.resolve(".tmp/direct-pdf-smoke");
fs.mkdirSync(output, { recursive: true });
for (const name of ["pdf-source-text", "server-pdf"]) {
  const source = fs.readFileSync(`src/lib/export/${name}.ts`, "utf8").replace('"./pdf-source-text"', '"./pdf-source-text.mjs"');
  fs.writeFileSync(path.join(output, `${name}.mjs`), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText);
}
const css = fs.readdirSync(".next/static/chunks").filter(file => file.endsWith(".css"))
  .map(file => fs.readFileSync(`.next/static/chunks/${file}`, "utf8")).join("\n");
const face = css.match(/@font-face\{[^}]*Noto Serif Devanagari[^}]*unicode-range:U\+900[^}]*\}/)?.[0];
assert.ok(face, "Run npm run build first to prepare the app's Sanskrit font.");
const fontName = path.basename(face.match(/src:url\(([^)]+)\)/)[1]);
const font = fs.readFileSync(`.next/static/media/${fontName}`).toString("base64");
const { renderBoardPdf } = await import(pathToFileURL(path.join(output, "server-pdf.mjs")));
const phrase = "क्षत्रियः ज्ञानम् विधिनिर्णयः";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Sanskrit;src:url(data:font/woff2;base64,${font})}
@page{size:600pt 14400pt;margin:0}html,body{margin:0;width:800px;height:19200px;overflow:hidden}
body{font-family:Sanskrit;font-size:24px}section{position:absolute;left:20px;width:700px;padding:20px;
border:2px solid blue;border-radius:30px;background:white;box-shadow:0 0 12px purple}
p{color:blue}a{color:#cc2277;text-decoration:underline;text-underline-position:under}
</style></head><body><div id="board-print-sheet"><section style="top:20px"><p>${phrase}</p>
<a href="https://ashtadhyayi.com/sutraani/3/4/89">३.४.८९ मेर्निः</a></section>
<section style="top:18700px"><p>${phrase}</p><p>अन्तिमः</p></section></div>
<script>document.body.replaceChildren();fetch('https://example.com/never')</script></body></html>`;
const bytes = await renderBoardPdf(html);
fs.writeFileSync(path.join(output, "long-sanskrit.pdf"), bytes);
const task = getDocument({ data: bytes });
try {
  const pdf = await task.promise;
  assert.equal(pdf.numPages, 1);
  const page = await pdf.getPage(1);
  assert.ok(Math.abs(page.view[3] - 14400) < 1);
  const text = (await page.getTextContent()).items.map(item => item.str ?? "").join(" ");
  assert.equal(text.match(new RegExp(phrase, "g"))?.length, 2);
  assert.ok(text.includes("अन्तिमः"));
  assert.ok(!text.includes("\u0000"));
} finally { await task.destroy(); }
await assert.rejects(renderBoardPdf(html.replace("</body>", '<img src="http://127.0.0.1:9/blocked"></body>')));
console.log("PASS: direct renderer, one long page, off-screen text, Unicode phrases, disabled scripts, blocked external image.");
