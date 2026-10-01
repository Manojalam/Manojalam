import { prepareReactFlowDomSvg, type PrepareDomExportSvgOptions } from "./dom-renderer";
import { resolvePdfPageSize } from "./pdf";

/** Browser printing must receive HTML, not an image containing foreignObject. */
export function createBrowserPdfDocument(source: string, width: number, height: number, title = "Board") {
  const page = resolvePdfPageSize(width, height);
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const wrapper = parsed.querySelector("svg > foreignObject > div");
  if (!wrapper || parsed.querySelector("parsererror")) throw new Error("The printable board could not be prepared.");
  const doc = document.implementation.createHTMLDocument(title);
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
    const timer = setTimeout(() => finish(() => reject(new Error("Print resources timed out. Try the image PDF download instead."))), timeout);
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
    if (!image.naturalWidth) throw new Error("An image could not be loaded for printing.");
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
  if (failedFonts.length) throw new Error("A required font could not be loaded. Retry before printing Sanskrit text.");
}

let activeFrame: HTMLIFrameElement | undefined;

/** Optional native print path. The existing jsPDF download remains the fallback. */
export async function printBoardPdf(options: PrepareDomExportSvgOptions) {
  const nodeIds = options.nodeIds ? Array.from(options.nodeIds) : undefined;
  await waitForBrowserPdfResources(document, options.signal, options.viewport);
  const prepared = await prepareReactFlowDomSvg({ ...options, nodeIds, preserveNativeEffects: true });
  if (nodeIds?.some(id => !prepared.includedNodeIds.includes(id))) {
    throw new Error("Some board objects are still rendering. Wait a moment and retry printing.");
  }
  if (prepared.assets.warnings.length) {
    throw new Error("Some board fonts or images could not be prepared. Retry or use the image PDF download and review its resource warnings.");
  }
  const output = createBrowserPdfDocument(prepared.source, prepared.width, prepared.height, options.title);
  activeFrame?.remove();
  const frame = document.createElement("iframe");
  activeFrame = frame;
  frame.title = "Board PDF print document";
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${prepared.width}px;height:${prepared.height}px;border:0;`;
  const dispose = () => { frame.remove(); if (activeFrame === frame) activeFrame = undefined; };
  try {
    const loaded = new Promise<void>(resolve => { frame.onload = () => resolve(); });
    frame.srcdoc = output.html;
    document.body.append(frame);
    await abortable(loaded, options.signal);
    const target = frame.contentWindow;
    if (!target || !frame.contentDocument) throw new Error("Your browser could not open the print document. Use the image PDF download instead.");
    await waitForBrowserPdfResources(frame.contentDocument, options.signal);
    if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    target.addEventListener("afterprint", () => setTimeout(dispose, 1000), { once: true });
    target.focus();
    target.print();
    return { pageWidth: output.width, pageHeight: output.height };
  } catch (error) {
    dispose();
    throw error;
  }
}
