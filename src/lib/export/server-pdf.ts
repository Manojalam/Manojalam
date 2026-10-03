import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { addPdfSourceText } from "./pdf-source-text";

export class PdfFontError extends Error {}

/** No remote resources or user scripts are allowed in the rendering browser. */
export async function renderBoardPdf(html: string, signal?: AbortSignal) {
  const localPath = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  const browser = await puppeteer.launch({
    executablePath: localPath || await chromium.executablePath(),
    args: localPath ? (/msedge(?:\.exe)?$/i.test(localPath)
      ? ["--edge-skip-compat-layer-relaunch", "--disable-features=msEdgeUpdateLaunchServicesPreferredVersion,AutoDeElevate"] : []) : chromium.args,
    headless: localPath ? true : "shell", timeout: 30_000,
  });
  const stop = () => { void browser.close(); };
  const timeout = setTimeout(stop, 60_000);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    signal?.throwIfAborted();
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    let blockedResource = false;
    page.on("request", request => {
      if (request.url() === "https://board-pdf.invalid/" && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        void request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html, headers: {
          "content-security-policy": "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
        } });
      } else if (/^(data:|about:blank$)/.test(request.url())) void request.continue();
      else { blockedResource = true; void request.abort(); }
    });
    await page.goto("https://board-pdf.invalid/", { waitUntil: "load", timeout: 30_000 });
    await page.emulateMediaType("print");
    const words = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
      if (Array.from(document.fonts).some(font => font.status === "error")) throw new Error("A PDF font failed to load.");
      const images = new Set<string>();
      document.querySelectorAll("*").forEach(element => {
        for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?(.+?)["']?\)/g)) images.add(match[1]);
        if (element.localName === "image") {
          const href = element.getAttribute("href") ?? element.getAttribute("xlink:href");
          if (href && !href.startsWith("#")) images.add(href);
        }
      });
      await Promise.all(Array.from(images, async src => { const image = new Image(); image.src = src; await image.decode(); }));
      const words: { text: string; x: number; y: number; width: number; height: number }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent || parent.closest("style,script,noscript")) continue;
        const style = getComputedStyle(parent);
        if (style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) continue;
        for (const match of (node.textContent ?? "").matchAll(/\S+\s*/gu)) {
          const range = document.createRange();
          range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].trimEnd().length);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            parent.setAttribute("data-pdf-font-check", "");
            words.push({ text: match[0].replace(/\s+/gu, " "), x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          }
          if (words.length > 100_000) throw new Error("The board contains too much text for one PDF export.");
        }
      }
      return words;
    });
    if (blockedResource) throw new Error("The PDF contains a resource that was not embedded.");
    // Inspect the fonts actually used for glyphs, not merely declared CSS.
    // A loaded Latin font can still fall back to a different system Indic font.
    const session = await page.createCDPSession();
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    const { nodeIds } = await session.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-pdf-font-check]" });
    for (let offset = 0; offset < nodeIds.length; offset += 32) {
      const results = await Promise.all(nodeIds.slice(offset, offset + 32).map(nodeId => session.send("CSS.getPlatformFontsForNode", { nodeId })));
      if (results.some(result => result.fonts.some(font => font.glyphCount > 0 && !font.isCustomFont))) {
        throw new PdfFontError("Some text requires a font or glyph that was not embedded. PDF export stopped to avoid changing its appearance. Use image PDF to preserve the board exactly.");
      }
    }
    await session.detach();
    const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: false, timeout: 30_000 });
    return await addPdfSourceText(bytes, words);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", stop);
    await browser.close();
  }
}
