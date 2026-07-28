import { compactRawHierarchy, type RawHierarchyNode } from "./draft";
import { normalizeImportedText } from "./script";
import type {
  HierarchyDraft,
  HierarchyDraftNode,
  HierarchyImportKind,
  HierarchyParseOptions,
} from "./types";

const TEXT_LIMIT_BYTES = 10 * 1024 * 1024;

export function filenameWithoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/u, "").trim() || "Imported hierarchy";
}

export function decodeTextBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes)
    .replace(/^\ufeff/u, "");
}

function stripOutlineMarker(value: string): string {
  return value
    .replace(/^\s*(?:[-+*•▪◦]|\(?\d+[.)]|\(?[A-Za-z][.)])\s+/u, "")
    .trim();
}

function visualIndent(prefix: string): number {
  let width = 0;
  for (const character of prefix) {
    width += character === "\t" ? 4 : 1;
  }
  return width;
}

function indentLevels(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function parseIndentedTextRaw(source: string): RawHierarchyNode[] {
  const parsedLines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, index) => {
      const prefix = line.match(/^[\t ]*/u)?.[0] ?? "";
      return {
        line: index + 1,
        indent: visualIndent(prefix),
        text: stripOutlineMarker(line.slice(prefix.length)),
      };
    })
    .filter((line) => line.text.length > 0);

  const levels = indentLevels(parsedLines.map((line) => line.indent));
  const roots: RawHierarchyNode[] = [];
  const stack: RawHierarchyNode[] = [];

  for (const line of parsedLines) {
    const requestedDepth = Math.max(0, levels.indexOf(line.indent));
    const depth = Math.min(requestedDepth, stack.length);
    const node: RawHierarchyNode = {
      text: line.text,
      children: [],
      confidence: 1,
      source: { kind: "text", lineStart: line.line },
    };
    if (depth === 0 || !stack.length) {
      roots.push(node);
      stack.length = 0;
      stack.push(node);
      continue;
    }
    const parent = stack[depth - 1] ?? stack.at(-1);
    parent?.children.push(node);
    stack.length = depth;
    stack.push(node);
  }
  return roots;
}

function makeDraft(
  sourceKind: HierarchyImportKind,
  sourceName: string,
  title: string,
  roots: HierarchyDraftNode[],
  previewText: string,
  warnings: string[] = []
): HierarchyDraft {
  if (!roots.length) {
    throw new Error("No hierarchy content was found in this file.");
  }
  return {
    title: normalizeImportedText(title) || filenameWithoutExtension(sourceName),
    sourceName,
    sourceKind,
    roots,
    warnings,
    previewText,
  };
}

export function parseTextHierarchy(
  source: string,
  sourceName: string
): HierarchyDraft {
  const roots = compactRawHierarchy(parseIndentedTextRaw(source));
  return makeDraft(
    "text",
    sourceName,
    roots[0]?.label ?? filenameWithoutExtension(sourceName),
    roots,
    source
  );
}

function directElementText(element: Element): string {
  const chunks: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      chunks.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "ol" || tag === "ul") return;
    if (tag === "br") {
      chunks.push("\n");
      return;
    }
    node.childNodes.forEach(visit);
    if (["p", "div", "section"].includes(tag)) chunks.push("\n");
  };
  element.childNodes.forEach(visit);
  return normalizeImportedText(chunks.join(""));
}

function directChildLists(element: Element): Element[] {
  return Array.from(element.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return tag === "ol" || tag === "ul";
  });
}

function directListItems(list: Element): Element[] {
  return Array.from(list.children).filter(
    (child) => child.tagName.toLowerCase() === "li"
  );
}

function parseListItem(
  item: Element,
  sourceLines: string[],
  sourceIndex: { value: number }
): RawHierarchyNode | null {
  const text = directElementText(item);
  if (!text) return null;
  sourceIndex.value += 1;
  sourceLines.push(text);
  const node: RawHierarchyNode = {
    text,
    children: [],
    confidence: 1,
    source: { kind: "html", lineStart: sourceIndex.value },
  };
  for (const list of directChildLists(item)) {
    for (const child of directListItems(list)) {
      const parsed = parseListItem(child, sourceLines, sourceIndex);
      if (parsed) node.children.push(parsed);
    }
  }
  return node;
}

function topLevelLists(body: HTMLElement): Element[] {
  return Array.from(body.querySelectorAll("ol, ul")).filter(
    (list) => !list.parentElement?.closest("li")
  );
}

function parseHeadingDocument(
  body: HTMLElement,
  sourceLines: string[]
): RawHierarchyNode[] {
  const roots: RawHierarchyNode[] = [];
  const stack: Array<{ level: number; node: RawHierarchyNode }> = [];
  let sourceIndex = 0;
  const blocks = body.querySelectorAll("h1,h2,h3,h4,h5,h6,p");
  blocks.forEach((element) => {
    const text = normalizeImportedText(element.textContent ?? "");
    if (!text) return;
    sourceIndex += 1;
    sourceLines.push(text);
    const heading = /^H[1-6]$/u.test(element.tagName);
    if (!heading) {
      const current = stack.at(-1)?.node;
      if (current) {
        current.children.push({
          text,
          children: [],
          confidence: 1,
          source: { kind: "html", lineStart: sourceIndex },
        });
      } else {
        roots.push({
          text,
          children: [],
          confidence: 0.8,
          source: { kind: "html", lineStart: sourceIndex },
        });
      }
      return;
    }

    const level = Number(element.tagName.slice(1));
    const node: RawHierarchyNode = {
      text,
      children: [],
      confidence: 1,
      source: { kind: "html", lineStart: sourceIndex },
    };
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    if (stack.length) stack.at(-1)!.node.children.push(node);
    else roots.push(node);
    stack.push({ level, node });
  });
  return roots;
}

export function parseHtmlHierarchy(
  source: string,
  sourceName: string
): HierarchyDraft {
  if (typeof DOMParser === "undefined") {
    throw new Error("HTML import requires a browser environment.");
  }
  const document = new DOMParser().parseFromString(source, "text/html");
  document
    .querySelectorAll("script,style,iframe,object,embed,form,noscript,template")
    .forEach((element) => element.remove());
  const body = document.body;
  const sourceLines: string[] = [];
  const sourceIndex = { value: 0 };
  const lists = topLevelLists(body);
  const rawRoots: RawHierarchyNode[] = [];

  for (const list of lists) {
    for (const item of directListItems(list)) {
      const parsed = parseListItem(item, sourceLines, sourceIndex);
      if (parsed) rawRoots.push(parsed);
    }
  }

  if (!rawRoots.length) {
    rawRoots.push(...parseHeadingDocument(body, sourceLines));
  }
  const roots = compactRawHierarchy(rawRoots);
  const title = normalizeImportedText(document.title) ||
    roots[0]?.label ||
    filenameWithoutExtension(sourceName);
  return makeDraft("html", sourceName, title, roots, sourceLines.join("\n"));
}

export async function parseTextFile(
  file: File,
  kind: "text" | "html",
  options: HierarchyParseOptions = {}
): Promise<HierarchyDraft> {
  if (file.size > TEXT_LIMIT_BYTES) {
    throw new Error("TXT and HTML files must be 10 MB or smaller.");
  }
  if (options.signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
  options.onProgress?.({ stage: "Reading text", progress: 0.2 });
  const source = decodeTextBuffer(await file.arrayBuffer());
  if (options.signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
  options.onProgress?.({ stage: kind === "html" ? "Reading HTML structure" : "Reading outline indentation", progress: 0.65 });
  const draft = kind === "html"
    ? parseHtmlHierarchy(source, file.name)
    : parseTextHierarchy(source, file.name);
  options.onProgress?.({ stage: "Hierarchy ready for review", progress: 1 });
  return draft;
}
