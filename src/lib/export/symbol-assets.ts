const SVG_NS = "http://www.w3.org/2000/svg";

// Capture these with the originating browser's font fallback, before portable
// fonts are applied. Neither the PDF service nor an SVG viewer needs emoji fonts.
const SYMBOL_PATTERN = /[✓✔☑✅✕✖✗✘❌☐☒❀✿❁✾❃🌼🌸🌺🌻🌹🪷💐][\uFE0E\uFE0F]?/gu;

interface SymbolImage {
  url: string;
  width: number;
  height: number;
  ascent: number;
  descent: number;
}

function captureSymbol(doc: Document, symbol: string, style: CSSStyleDeclaration, color = style.color): SymbolImage {
  const canvas = doc.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare symbol images for export.");
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${fontSize}px ${style.fontFamily || "sans-serif"}`;
  context.font = font;
  const metrics = context.measureText(symbol);
  const ascent = Math.ceil(Math.max(metrics.actualBoundingBoxAscent || fontSize * 0.8, metrics.fontBoundingBoxAscent || 0)) + 1;
  const descent = Math.ceil(Math.max(metrics.actualBoundingBoxDescent || 0, metrics.fontBoundingBoxDescent || fontSize * 0.2)) + 1;
  const left = Math.max(0, Math.ceil(metrics.actualBoundingBoxLeft || 0));
  const width = Math.max(1, metrics.width);
  const inkWidth = Math.max(width, left + (metrics.actualBoundingBoxRight || width));
  const height = ascent + descent;
  // High-resolution assets remain crisp when a board is enlarged or printed.
  const resolution = 4;
  canvas.width = Math.ceil(inkWidth * resolution);
  canvas.height = Math.ceil(height * resolution);
  context.scale(resolution, resolution);
  context.font = font;
  context.fillStyle = color || "#000000";
  context.textBaseline = "alphabetic";
  context.fillText(symbol, left, ascent);
  return { url: canvas.toDataURL("image/png"), width: inkWidth, height, ascent, descent };
}

function imageElement(doc: Document, symbol: string, asset: SymbolImage): HTMLImageElement {
  const image = doc.createElement("img");
  image.src = asset.url;
  image.alt = symbol;
  image.setAttribute("data-export-symbol", symbol);
  image.style.cssText = `display:inline-block!important;width:${asset.width}px!important;height:${asset.height}px!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;vertical-align:-${asset.descent}px!important;object-fit:contain!important`;
  return image;
}

/** Work only on the export clone. The original text and rich-text marks stay intact. */
export function embedExportSymbolImages(source: Element, target: Element): void {
  if (["script", "style", "title", "desc"].includes(source.localName)) return;
  // SVG text needs native image siblings; HTML images cannot be placed in <text>.
  if (source.namespaceURI === SVG_NS) {
    if (source.localName === "text") embedSvgTextSymbols(source as SVGTextElement, target as SVGTextElement);
    return;
  }
  const sourceNodes = Array.from(source.childNodes);
  const targetNodes = Array.from(target.childNodes);
  for (let index = 0; index < sourceNodes.length; index++) {
    const node = sourceNodes[index];
    const copy = targetNodes[index];
    if (node.nodeType !== 3 || copy?.nodeType !== 3) continue;
    const text = node.textContent ?? "";
    const matches = Array.from(text.matchAll(SYMBOL_PATTERN));
    if (!matches.length) continue;
    const doc = source.ownerDocument;
    const style = doc.defaultView!.getComputedStyle(source);
    const replacement = target.ownerDocument.createDocumentFragment();
    let start = 0;
    for (const match of matches) {
      replacement.append(target.ownerDocument.createTextNode(text.slice(start, match.index)));
      replacement.append(imageElement(target.ownerDocument, match[0], captureSymbol(doc, match[0], style)));
      start = match.index + match[0].length;
    }
    replacement.append(target.ownerDocument.createTextNode(text.slice(start)));
    copy.parentNode!.replaceChild(replacement, copy);
  }
}

function embedSvgTextSymbols(source: SVGTextElement, target: SVGTextElement): void {
  const doc = source.ownerDocument;
  const walk = (root: Node): Text[] => {
    const nodes: Text[] = [];
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === 3) nodes.push(child as Text);
      else nodes.push(...walk(child));
    }
    return nodes;
  };
  const sourceNodes = walk(source);
  const targetNodes = walk(target);
  const images: SVGImageElement[] = [];
  let offset = 0;
  sourceNodes.forEach((node, index) => {
    const text = node.data;
    const replacement = target.ownerDocument.createDocumentFragment();
    let start = 0;
    for (const match of text.matchAll(SYMBOL_PATTERN)) {
      const position = source.getStartPositionOfChar(offset + match.index);
      const rotation = source.getRotationOfChar(offset + match.index);
      const style = doc.defaultView!.getComputedStyle(node.parentElement!);
      // In SVG, fill controls glyph paint rather than the HTML color property.
      const asset = captureSymbol(doc, match[0], style, style.fill === "currentcolor" ? style.color : style.fill);
      const image = target.ownerDocument.createElementNS(SVG_NS, "image");
      image.setAttribute("href", asset.url);
      image.setAttribute("data-export-symbol", match[0]);
      image.setAttribute("x", "0");
      image.setAttribute("y", String(-asset.ascent));
      image.setAttribute("width", String(asset.width));
      image.setAttribute("height", String(asset.height));
      image.style.setProperty("opacity", style.fillOpacity || "1");
      image.setAttribute("transform", `translate(${position.x} ${position.y}) rotate(${rotation})`);
      images.push(image);
      replacement.append(target.ownerDocument.createTextNode(text.slice(start, match.index)));
      const placeholder = target.ownerDocument.createElementNS(SVG_NS, "tspan");
      // Keep the advance without leaving a hidden missing glyph for Chromium's
      // font audit. NBSP is covered by the authored text face and won't collapse.
      placeholder.textContent = "\u00a0";
      placeholder.setAttribute("textLength", String(source.getSubStringLength(offset + match.index, match[0].length)));
      placeholder.setAttribute("lengthAdjust", "spacingAndGlyphs");
      placeholder.setAttribute("data-export-symbol-placeholder", "");
      placeholder.style.setProperty("fill-opacity", "0", "important");
      placeholder.style.setProperty("stroke-opacity", "0", "important");
      replacement.append(placeholder);
      start = match.index + match[0].length;
    }
    if (start) {
      replacement.append(target.ownerDocument.createTextNode(text.slice(start)));
      targetNodes[index].parentNode!.replaceChild(replacement, targetNodes[index]);
    }
    offset += text.length;
  });
  if (!images.length) return;
  const group = target.ownerDocument.createElementNS(SVG_NS, "g");
  // Positions are in the text's own coordinate system. Move its transform to
  // the wrapper so the image follows rotated/scaled labels as well.
  for (const property of ["transform", "transform-origin", "transform-box", "opacity", "visibility", "filter", "clip-path"] as const) {
    const value = target.style.getPropertyValue(property);
    if (value) { group.style.setProperty(property, value); target.style.removeProperty(property); }
  }
  if (target.hasAttribute("transform")) { group.setAttribute("transform", target.getAttribute("transform")!); target.removeAttribute("transform"); }
  target.parentNode!.replaceChild(group, target);
  group.append(target, ...images);
}
