import {
  compactRawHierarchy,
  createDraftNode,
  ensureSingleDraftRoot,
  preserveRawHierarchy,
  type RawHierarchyNode,
} from "./draft";
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

interface NativeOutlineNode {
  label: string;
  noteParts: string[];
  children: NativeOutlineNode[];
  line: number;
}

interface NativeOutlineDetail {
  label: string;
  lines: string[];
  node: NativeOutlineNode;
}

const NATIVE_OUTLINE_NODE =
  /^([\t ]*)(\d+(?:\.\d+)*)\.\s+(.+?)(?:\s+\[([^\]\r\n]+)\])?\s*$/u;
const NATIVE_MARKDOWN_NODE =
  /^([\t ]*)1\.\s+\*\*(.+)\*\*(?:\s+_\(([^)]*)\)_)?\s*$/u;
const NATIVE_MARKDOWN_DETAIL =
  /^([\t ]*)-\s+\*\*(.+):\*\*\s*(.*)$/u;

function nativeOutlineHeader(
  lines: readonly string[]
): { title: string; bodyStart: number } | null {
  const titleIndex = lines.findIndex((line) => line.trim().length > 0);
  if (titleIndex < 0 || !/^={3,}$/u.test(lines[titleIndex + 1]?.trim() ?? "")) {
    return null;
  }

  for (let index = titleIndex + 2; index + 1 < lines.length; index += 1) {
    if (
      lines[index].trim().toLocaleLowerCase() === "outline"
      && /^-{3,}$/u.test(lines[index + 1].trim())
      && lines.slice(index + 2).some((line) => NATIVE_OUTLINE_NODE.test(line))
    ) {
      return {
        title: normalizeImportedText(lines[titleIndex]),
        bodyStart: index + 2,
      };
    }
  }
  return null;
}

function isNativeOutlineSection(
  lines: readonly string[],
  index: number
): boolean {
  return /^(?:connections|relationships)$/iu.test(lines[index]?.trim() ?? "")
    && /^-{3,}$/u.test(lines[index + 1]?.trim() ?? "");
}

function outlineDetailText(
  nodeLabel: string,
  detailLabel: string,
  detailLines: readonly string[]
): string {
  const lines = detailLines.map((line) => line.trim());
  const label = normalizeImportedText(detailLabel);
  if (label.toLocaleLowerCase() === "text") {
    if (
      lines.length
      && normalizeImportedText(lines[0]).toLocaleLowerCase()
        === normalizeImportedText(nodeLabel).toLocaleLowerCase()
    ) {
      lines.shift();
    }
    return normalizeImportedText(lines.join("\n"));
  }
  if (label.toLocaleLowerCase() === "notes") {
    return normalizeImportedText(lines.join("\n"));
  }
  const value = normalizeImportedText(lines.join("\n"));
  return value ? `${label}: ${value}` : label;
}

export function outlineDetailsToNotes(
  nodeLabel: string,
  details: readonly { label: string; value: string }[]
): string {
  return normalizeImportedText(
    details
      .map((detail) =>
        outlineDetailText(nodeLabel, detail.label, detail.value.split("\n"))
      )
      .filter(Boolean)
      .join("\n")
  );
}

function nativeDetailText(detail: NativeOutlineDetail): string {
  return outlineDetailText(detail.node.label, detail.label, detail.lines);
}

function parseNativeOutlineText(
  source: string,
  sourceName: string
): HierarchyDraft | null {
  const lines = source.replace(/^\ufeff/u, "").replace(/\r\n?/g, "\n").split("\n");
  const header = nativeOutlineHeader(lines);
  if (!header) return null;

  const roots: NativeOutlineNode[] = [];
  const nodesByPath = new Map<string, NativeOutlineNode>();
  let currentNode: NativeOutlineNode | null = null;
  let currentIndent = -1;
  let currentDetail: NativeOutlineDetail | null = null;

  const flushDetail = () => {
    if (!currentDetail) return;
    const text = nativeDetailText(currentDetail);
    if (text) currentDetail.node.noteParts.push(text);
    currentDetail = null;
  };

  for (let index = header.bodyStart; index < lines.length; index += 1) {
    if (isNativeOutlineSection(lines, index)) break;
    const line = lines[index];
    const nodeMatch = line.match(NATIVE_OUTLINE_NODE);
    if (nodeMatch) {
      flushDetail();
      const path = nodeMatch[2];
      const pathParts = path.split(".");
      const node: NativeOutlineNode = {
        label: normalizeImportedText(nodeMatch[3]),
        noteParts: [],
        children: [],
        line: index + 1,
      };
      if (nodesByPath.has(path)) return null;
      if (pathParts.length === 1) {
        roots.push(node);
      } else {
        const parentPath = pathParts.slice(0, -1).join(".");
        const parent = nodesByPath.get(parentPath);
        if (!parent) return null;
        parent.children.push(node);
      }
      nodesByPath.set(path, node);
      currentNode = node;
      currentIndent = visualIndent(nodeMatch[1]);
      continue;
    }

    const text = line.trim();
    if (!text) continue;
    if (!currentNode) return null;
    const prefix = line.match(/^[\t ]*/u)?.[0] ?? "";
    const indent = visualIndent(prefix);
    if (indent <= currentIndent) return null;
    const detailMatch = text.match(/^([^:]+):(?:\s*(.*))?$/u);
    if (indent === currentIndent + 2 && detailMatch) {
      flushDetail();
      currentDetail = {
        label: detailMatch[1],
        lines: [detailMatch[2] ?? ""],
        node: currentNode,
      };
    } else if (currentDetail) {
      currentDetail.lines.push(text);
    } else {
      currentNode.noteParts.push(text);
    }
  }
  flushDetail();
  if (!roots.length) return null;

  const toDraftNode = (node: NativeOutlineNode): HierarchyDraftNode =>
    createDraftNode(node.label, {
      notes: node.noteParts.join("\n"),
      children: node.children.map(toDraftNode),
      source: { kind: "text", lineStart: node.line },
    });
  const draft = makeDraft(
    "text",
    sourceName,
    header.title || filenameWithoutExtension(sourceName),
    roots.map(toDraftNode),
    source
  );
  return draft.roots.length > 1
    ? ensureSingleDraftRoot(draft, draft.title)
    : draft;
}

function unescapeOutlineMarkdown(value: string): string {
  return value.replace(/\\([\\`*_[\]<>])/gu, "$1");
}

function parseNativeMarkdownText(
  source: string,
  sourceName: string
): HierarchyDraft | null {
  const lines = source.replace(/^\ufeff/u, "").replace(/\r\n?/g, "\n").split("\n");
  const titleIndex = lines.findIndex((line) => /^#\s+/u.test(line));
  const outlineIndex = lines.findIndex(
    (line, index) =>
      index > titleIndex && line.trim().toLocaleLowerCase() === "## outline"
  );
  if (titleIndex < 0 || outlineIndex < 0) return null;
  if (!lines.slice(outlineIndex + 1).some((line) => NATIVE_MARKDOWN_NODE.test(line))) {
    return null;
  }

  const titleMatch = lines[titleIndex].match(/^#\s+(.+)$/u);
  if (!titleMatch) return null;
  const roots: NativeOutlineNode[] = [];
  const stack: NativeOutlineNode[] = [];
  let currentNode: NativeOutlineNode | null = null;
  let currentIndent = -1;
  let currentDetail: NativeOutlineDetail | null = null;

  const flushDetail = () => {
    if (!currentDetail) return;
    const text = nativeDetailText(currentDetail);
    if (text) currentDetail.node.noteParts.push(text);
    currentDetail = null;
  };

  for (let index = outlineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/u.test(line.trim())) break;
    if (!line.trim()) continue;

    const nodeMatch = line.match(NATIVE_MARKDOWN_NODE);
    if (nodeMatch) {
      flushDetail();
      const indent = visualIndent(nodeMatch[1]);
      if (indent % 4 !== 0) return null;
      const depth = indent / 4;
      if (depth > stack.length) return null;
      const node: NativeOutlineNode = {
        label: normalizeImportedText(unescapeOutlineMarkdown(nodeMatch[2])),
        noteParts: [],
        children: [],
        line: index + 1,
      };
      if (depth === 0) {
        roots.push(node);
      } else {
        const parent = stack[depth - 1];
        if (!parent) return null;
        parent.children.push(node);
      }
      stack.length = depth;
      stack.push(node);
      currentNode = node;
      currentIndent = indent;
      continue;
    }

    const detailMatch = line.match(NATIVE_MARKDOWN_DETAIL);
    if (!detailMatch || !currentNode) return null;
    const indent = visualIndent(detailMatch[1]);
    if (indent !== currentIndent + 4) return null;
    flushDetail();
    currentDetail = {
      label: unescapeOutlineMarkdown(detailMatch[2]),
      lines: unescapeOutlineMarkdown(detailMatch[3])
        .replace(/<br\s*\/?>/giu, "\n")
        .split("\n"),
      node: currentNode,
    };
  }
  flushDetail();
  if (!roots.length) return null;

  const toDraftNode = (node: NativeOutlineNode): HierarchyDraftNode =>
    createDraftNode(node.label, {
      notes: node.noteParts.join("\n"),
      children: node.children.map(toDraftNode),
      source: { kind: "text", lineStart: node.line },
    });
  const title = normalizeImportedText(unescapeOutlineMarkdown(titleMatch[1]));
  const draft = makeDraft(
    "text",
    sourceName,
    title || filenameWithoutExtension(sourceName),
    roots.map(toDraftNode),
    source
  );
  return draft.roots.length > 1
    ? ensureSingleDraftRoot(draft, draft.title)
    : draft;
}

export function parseTextHierarchy(
  source: string,
  sourceName: string
): HierarchyDraft {
  const nativeOutline = parseNativeOutlineText(source, sourceName);
  if (nativeOutline) return nativeOutline;
  const nativeMarkdown = parseNativeMarkdownText(source, sourceName);
  if (nativeMarkdown) return nativeMarkdown;
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

function directChildWithClass(
  element: Element,
  tagName: string,
  className: string
): Element | null {
  return Array.from(element.children).find(
    (child) =>
      child.tagName.toLowerCase() === tagName
      && child.classList.contains(className)
  ) ?? null;
}

function parseNativeHtmlListItem(
  item: Element,
  sourceLines: string[],
  sourceIndex: { value: number }
): HierarchyDraftNode | null {
  const article = directChildWithClass(item, "article", "outline-node");
  const titleElement = article?.querySelector(".outline-title");
  const label = normalizeImportedText(titleElement?.textContent ?? "");
  if (!article || !label) return null;

  const details = Array.from(article.querySelectorAll("dl > div")).flatMap(
    (row): Array<{ label: string; value: string }> => {
      const term = row.querySelector("dt");
      const description = row.querySelector("dd");
      const detailLabel = normalizeImportedText(term?.textContent ?? "");
      if (!detailLabel || !description) return [];
      return [{
        label: detailLabel,
        value: directElementText(description),
      }];
    }
  );
  const notes = outlineDetailsToNotes(label, details);
  sourceIndex.value += 1;
  const line = sourceIndex.value;
  sourceLines.push(...[label, notes].filter(Boolean));

  const childList = directChildWithClass(item, "ol", "outline-list");
  const children = childList
    ? directListItems(childList).flatMap((child) => {
        const parsed = parseNativeHtmlListItem(child, sourceLines, sourceIndex);
        return parsed ? [parsed] : [];
      })
    : [];
  return createDraftNode(label, {
    notes,
    children,
    source: { kind: "html", lineStart: line },
  });
}

function parseNativeHtmlOutline(
  document: Document,
  sourceName: string
): HierarchyDraft | null {
  const outlineList = Array.from(
    document.body.querySelectorAll("ol.outline-list")
  ).find((list) => {
    if (list.parentElement?.closest("li")) return false;
    const section = list.closest("section");
    const heading = section
      ? Array.from(section.children).find(
          (child) => child.tagName.toLowerCase() === "h2"
        )
      : null;
    return normalizeImportedText(heading?.textContent ?? "")
      .toLocaleLowerCase() === "outline";
  });
  if (!outlineList) return null;

  const sourceLines: string[] = [];
  const sourceIndex = { value: 0 };
  const roots = directListItems(outlineList).flatMap((item) => {
    const parsed = parseNativeHtmlListItem(item, sourceLines, sourceIndex);
    return parsed ? [parsed] : [];
  });
  if (!roots.length) return null;

  const headingTitle = normalizeImportedText(
    document.body.querySelector("main h1")?.textContent ?? ""
  );
  const documentTitle = normalizeImportedText(document.title)
    .replace(/\s+-\s+Outline$/iu, "");
  const draft = makeDraft(
    "html",
    sourceName,
    headingTitle || documentTitle || filenameWithoutExtension(sourceName),
    roots,
    sourceLines.join("\n")
  );
  return draft.roots.length > 1
    ? ensureSingleDraftRoot(draft, draft.title)
    : draft;
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
  const nativeOutline = parseNativeHtmlOutline(document, sourceName);
  if (nativeOutline) return nativeOutline;
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

  const hasSemanticListHierarchy = rawRoots.length > 0;
  if (!rawRoots.length) {
    rawRoots.push(...parseHeadingDocument(body, sourceLines));
  }
  const roots = hasSemanticListHierarchy
    ? preserveRawHierarchy(rawRoots)
    : compactRawHierarchy(rawRoots);
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
    throw new Error("TXT, Markdown, and HTML files must be 10 MB or smaller.");
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
