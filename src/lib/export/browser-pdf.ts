import { prepareReactFlowDomSvg, type PrepareDomExportSvgOptions } from "./dom-renderer";
import { resolvePdfPageSize } from "./pdf";

/** Browser printing must receive HTML, not an image containing foreignObject. */
export function createBrowserPdfDocument(source: string, width: number, height: number, title = "Board") {
  const page = resolvePdfPageSize(width, height);
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const wrapper = parsed.querySelector("svg > foreignObject > div");
  if (!wrapper || parsed.querySelector("parsererror")) throw new Error("The printable board could not be prepared.");
  const doc = document.implementation.createHTMLDocument(title);
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  doc.head.append(charset);
  const style = doc.createElement("style");
  const scale = page.pointsPerPixel / 0.75;
  style.textContent = `
    @page { size: ${page.width}pt ${page.height}pt; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${page.width / 0.75}px; height: ${page.height / 0.75}px; overflow: hidden; }
    *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #board-print-sheet { position: absolute; inset: 0; width: ${page.width / 0.75}px; height: ${page.height / 0.75}px; overflow: hidden; }
    #board-print-content { transform-origin: 0 0; transform: scale(${scale}); }
  `;
  doc.head.append(style);
  const sheet = doc.createElement("div");
  sheet.id = "board-print-sheet";
  const content = doc.createElement("div");
  content.id = "board-print-content";
  content.append(doc.importNode(wrapper, true));
  // Exported user content must remain inert even in a same-origin print frame.
  content.querySelectorAll("script,iframe,object,embed,base,meta,link").forEach(node => node.remove());
  content.querySelectorAll("*").forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || attribute.name === "contenteditable" || attribute.name === "autofocus") element.removeAttribute(attribute.name);
    }
  });
  sheet.append(content);
  doc.body.append(sheet);
  return { html: "<!doctype html>" + doc.documentElement.outerHTML, ...page };
}

function abortable<T>(work: Promise<T>, signal?: AbortSignal, timeout = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => finish(() => reject(new DOMException("Export cancelled", "AbortError")));
    const timer = setTimeout(() => finish(() => reject(new Error("PDF resources timed out. Try the image PDF download instead."))), timeout);
    function finish(action: () => void) { clearTimeout(timer); signal?.removeEventListener("abort", stop); action(); }
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) { stop(); return; }
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

/** Wait in the destination document too: embedded font faces load independently. */
export async function waitForBrowserPdfResources(doc: Document, signal?: AbortSignal, root: ParentNode = doc) {
  void doc.body.offsetHeight;
  await abortable(doc.fonts.ready, signal);
  await abortable(Promise.all(Array.from(root.querySelectorAll("img"), async image => {
    image.loading = "eager";
    await image.decode();
    if (!image.naturalWidth) throw new Error("An image could not be loaded for PDF export.");
  })), signal);
  const images = new Set<string>();
  root.querySelectorAll("*").forEach(element => {
    const background = doc.defaultView?.getComputedStyle(element).backgroundImage ?? "";
    for (const match of background.matchAll(/url\(["']?(.+?)["']?\)/g)) images.add(match[1]);
    if (element.localName === "image") {
      const href = element.getAttribute("href") ?? element.getAttribute("xlink:href");
      if (href && !href.startsWith("#")) images.add(href);
    }
  });
  await abortable(Promise.all(Array.from(images, async src => {
    const image = doc.createElement("img"); image.src = src; await image.decode();
  })), signal);
  const failedFonts = Array.from(doc.fonts).filter(font => font.status === "error");
  if (failedFonts.length) throw new Error("A required font could not be loaded. Retry before exporting Sanskrit text.");
}

export async function downloadBoardPdf(options: PrepareDomExportSvgOptions) {
  const nodeIds = options.nodeIds ? Array.from(options.nodeIds) : undefined;
  await waitForBrowserPdfResources(document, options.signal, options.viewport);
  const prepared = await prepareReactFlowDomSvg({ ...options, nodeIds, preserveNativeEffects: true });
  if (nodeIds?.some(id => !prepared.includedNodeIds.includes(id))) throw new Error("Some board objects are still rendering. Retry in a moment.");
  if (prepared.assets.warnings.length) throw new Error("Some board fonts or images could not be prepared. Retry or use the image PDF fallback.");
  const output = createBrowserPdfDocument(prepared.source, prepared.width, prepared.height, options.title);
  const source = new Blob([output.html]);
  if (source.size > 40_000_000) throw new Error("This board is too large for vector PDF. Use the image PDF fallback.");
  const compressed = await new Response(source.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  if (compressed.size > 4_000_000) throw new Error("This board is too large for vector PDF. Use the image PDF fallback.");
  const response = await fetch("/api/export-pdf", {
    method: "POST", headers: { "content-type": "application/gzip" }, body: compressed, signal: options.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "PDF export failed. Retry or use the image PDF fallback.");
  }
  const blob = await response.blob();
  options.signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = (options.title || "Board").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") + ".pdf";
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
