import type { VidyaBoard } from "../types";
import {
  encodeOutlinePdfMetadata,
  OUTLINE_PDF_METADATA_NAMESPACE,
} from "../outline-payload";
import {
  buildOutlineDocument,
  outlineFilename,
  type OutlineConnection,
  type OutlineDocument,
  type OutlineNode,
} from "./outline";
import { createMultiPageBoardPdf } from "./pdf";
import { initiateBlobDownload } from "./pipeline";

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1_056;
const RENDER_SCALE = 2;
const PAGE_LEFT = 56;
const PAGE_RIGHT = 56;
const PAGE_TOP = 54;
const PAGE_BOTTOM = 62;
const MAX_INDENT = 228;

type PdfLineStyle = "title" | "description" | "section" | "node" | "detail" | "connection" | "empty";

interface PdfSourceLine {
  text: string;
  indent: number;
  style: PdfLineStyle;
}

interface PdfBlock {
  gapBefore: number;
  keepTogether: boolean;
  lines: PdfSourceLine[];
}

interface PdfDrawLine {
  text: string;
  x: number;
  y: number;
  style: PdfLineStyle;
}

interface PdfLineMetrics {
  size: number;
  lineHeight: number;
  weight: 400 | 600 | 700;
  color: string;
}

const LINE_METRICS: Record<PdfLineStyle, PdfLineMetrics> = {
  title: { size: 27, lineHeight: 34, weight: 700, color: "#111827" },
  description: { size: 12, lineHeight: 18, weight: 400, color: "#526076" },
  section: { size: 16, lineHeight: 23, weight: 700, color: "#1d4ed8" },
  node: { size: 12.5, lineHeight: 19, weight: 600, color: "#172033" },
  detail: { size: 10.5, lineHeight: 16, weight: 400, color: "#475569" },
  connection: { size: 11, lineHeight: 17, weight: 400, color: "#334155" },
  empty: { size: 11, lineHeight: 17, weight: 400, color: "#64748b" },
};

function sourceLinesForNode(
  node: OutlineNode,
  depth: number,
  path: number[]
): PdfBlock[] {
  const indent = Math.min(depth * 24, MAX_INDENT);
  const lines: PdfSourceLine[] = [{
    text: `${path.join(".")}. ${node.title} [${node.type}]`,
    indent,
    style: "node",
  }];
  for (const detail of node.details) {
    const paragraphs = detail.value.split("\n");
    lines.push({
      text: `${detail.label}: ${paragraphs[0]}`,
      indent: Math.min(indent + 18, MAX_INDENT + 18),
      style: "detail",
    });
    for (const paragraph of paragraphs.slice(1)) {
      lines.push({
        text: paragraph,
        indent: Math.min(indent + 30, MAX_INDENT + 30),
        style: "detail",
      });
    }
  }
  const blocks: PdfBlock[] = [{ gapBefore: depth === 0 ? 8 : 4, keepTogether: true, lines }];
  node.children.forEach((child, index) => {
    blocks.push(...sourceLinesForNode(child, depth + 1, [...path, index + 1]));
  });
  return blocks;
}

function connectionBlocks(
  heading: string,
  connections: readonly OutlineConnection[]
): PdfBlock[] {
  if (!connections.length) return [];
  return [
    {
      gapBefore: 18,
      keepTogether: true,
      lines: [{ text: heading, indent: 0, style: "section" }],
    },
    ...connections.map((connection) => ({
      gapBefore: 4,
      keepTogether: true,
      lines: [{
        text: `- ${connection.source} -> ${connection.target}: ${connection.label}`,
        indent: 0,
        style: "connection" as const,
      }],
    })),
  ];
}

function outlinePdfBlocks(outline: OutlineDocument): PdfBlock[] {
  const blocks: PdfBlock[] = [{
    gapBefore: 0,
    keepTogether: true,
    lines: [{ text: outline.title, indent: 0, style: "title" }],
  }];
  if (outline.description) {
    blocks.push({
      gapBefore: 8,
      keepTogether: false,
      lines: outline.description.split("\n").map((text) => ({
        text,
        indent: 0,
        style: "description",
      })),
    });
  }
  blocks.push({
    gapBefore: 20,
    keepTogether: true,
    lines: [{ text: "Outline", indent: 0, style: "section" }],
  });
  if (outline.roots.length) {
    outline.roots.forEach((root, index) => {
      blocks.push(...sourceLinesForNode(root, 0, [index + 1]));
    });
  } else {
    blocks.push({
      gapBefore: 6,
      keepTogether: true,
      lines: [{ text: "No outline content.", indent: 0, style: "empty" }],
    });
  }
  blocks.push(
    ...connectionBlocks("Connections", outline.connections),
    ...connectionBlocks("Relationships", outline.relationships)
  );
  return blocks;
}

function resolvedFontStack(): string {
  const styles = window.getComputedStyle(document.documentElement);
  const sans = styles.getPropertyValue("--font-geist-sans").trim();
  const devanagari = styles.getPropertyValue("--font-noto-devanagari").trim();
  return [
    sans,
    devanagari,
    "\"Noto Sans Devanagari\"",
    "\"Nirmala UI\"",
    "Arial",
    "sans-serif",
  ].filter(Boolean).join(", ");
}

function applyFont(
  context: CanvasRenderingContext2D,
  style: PdfLineStyle,
  fontStack: string
): void {
  const metrics = LINE_METRICS[style];
  context.font = `${metrics.weight} ${metrics.size}px ${fontStack}`;
}

function splitLongToken(
  context: CanvasRenderingContext2D,
  token: string,
  maxWidth: number
): string[] {
  const parts: string[] = [];
  let current = "";
  for (const character of Array.from(token)) {
    const candidate = `${current}${character}`;
    if (current && context.measureText(candidate).width > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.length ? parts : [token];
}

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number
): string[] {
  if (!value) return [""];
  const tokens = value.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const parts = context.measureText(token).width > maxWidth
      ? splitLongToken(context, token, maxWidth)
      : [token];
    for (const part of parts) {
      const candidate = current ? `${current} ${part}` : part;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = part;
      } else {
        current = candidate;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function layoutPdfPages(
  context: CanvasRenderingContext2D,
  blocks: readonly PdfBlock[],
  fontStack: string
): PdfDrawLine[][] {
  const pages: PdfDrawLine[][] = [[]];
  let pageIndex = 0;
  let y = PAGE_TOP;
  const pageBottom = PAGE_HEIGHT - PAGE_BOTTOM;
  const contentWidth = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;

  const nextPage = () => {
    pages.push([]);
    pageIndex += 1;
    y = PAGE_TOP;
  };

  for (const block of blocks) {
    const wrapped = block.lines.flatMap((line) => {
      applyFont(context, line.style, fontStack);
      const maxWidth = Math.max(120, contentWidth - line.indent);
      return wrapText(context, line.text, maxWidth).map((text) => ({
        ...line,
        text,
      }));
    });
    const blockHeight = wrapped.reduce(
      (height, line) => height + LINE_METRICS[line.style].lineHeight,
      block.gapBefore
    );
    const fullPageContentHeight = pageBottom - PAGE_TOP;
    if (
      block.keepTogether
      && blockHeight <= fullPageContentHeight
      && y > PAGE_TOP
      && y + blockHeight > pageBottom
    ) {
      nextPage();
    }
    y += y === PAGE_TOP ? Math.min(block.gapBefore, 4) : block.gapBefore;
    for (const line of wrapped) {
      const metrics = LINE_METRICS[line.style];
      if (y + metrics.lineHeight > pageBottom && pages[pageIndex].length) {
        nextPage();
      }
      pages[pageIndex].push({
        text: line.text,
        x: PAGE_LEFT + line.indent,
        y,
        style: line.style,
      });
      y += metrics.lineHeight;
    }
  }
  return pages;
}

function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to encode an outline PDF page."));
    }, "image/png");
  });
}

async function renderPdfPage(
  lines: readonly PdfDrawLine[],
  pageNumber: number,
  pageCount: number,
  fontStack: string
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH * RENDER_SCALE;
  canvas.height = PAGE_HEIGHT * RENDER_SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the outline PDF canvas.");
  context.scale(RENDER_SCALE, RENDER_SCALE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.textBaseline = "top";

  for (const line of lines) {
    const metrics = LINE_METRICS[line.style];
    applyFont(context, line.style, fontStack);
    context.fillStyle = metrics.color;
    context.fillText(line.text, line.x, line.y);
    if (line.style === "section") {
      context.fillStyle = "#dbeafe";
      context.fillRect(line.x, line.y + metrics.lineHeight - 3, PAGE_WIDTH - PAGE_RIGHT - line.x, 2);
    }
  }

  const footerY = PAGE_HEIGHT - 36;
  context.fillStyle = "#e2e8f0";
  context.fillRect(PAGE_LEFT, footerY - 12, PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT, 1);
  context.font = `400 9px ${fontStack}`;
  context.fillStyle = "#64748b";
  context.textAlign = "right";
  context.fillText(`Page ${pageNumber} of ${pageCount}`, PAGE_WIDTH - PAGE_RIGHT, footerY);
  context.textAlign = "left";
  return canvasPngBlob(canvas);
}

export interface DownloadedOutlinePdf {
  pageCount: number;
  filename: string;
}

export async function downloadPdfOutline(board: VidyaBoard): Promise<DownloadedOutlinePdf> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("PDF outline export requires a browser.");
  }
  await document.fonts?.ready;
  const outline = buildOutlineDocument(board);
  const fontStack = resolvedFontStack();
  const measurementCanvas = document.createElement("canvas");
  const measurementContext = measurementCanvas.getContext("2d");
  if (!measurementContext) {
    throw new Error("Unable to measure outline PDF text.");
  }
  const pages = layoutPdfPages(
    measurementContext,
    outlinePdfBlocks(outline),
    fontStack
  );
  const renderedPages = [];
  for (const [index, lines] of pages.entries()) {
    const png = await renderPdfPage(lines, index + 1, pages.length, fontStack);
    renderedPages.push({
      png,
      sourceWidth: PAGE_WIDTH * RENDER_SCALE,
      sourceHeight: PAGE_HEIGHT * RENDER_SCALE,
      exportBounds: {
        x: 0,
        y: 0,
        width: PAGE_WIDTH * RENDER_SCALE,
        height: PAGE_HEIGHT * RENDER_SCALE,
      },
    });
  }
  const pdf = await createMultiPageBoardPdf({
    pages: renderedPages,
    paperSize: "letter",
    orientation: "portrait",
    margin: 0,
    title: `${outline.title} - Outline`,
    xmpMetadata: {
      value: encodeOutlinePdfMetadata(outline),
      namespaceUri: OUTLINE_PDF_METADATA_NAMESPACE,
    },
  });
  const filename = outlineFilename(outline.title, "pdf");
  initiateBlobDownload(pdf.blob, filename);
  return { pageCount: pdf.pageCount, filename };
}
