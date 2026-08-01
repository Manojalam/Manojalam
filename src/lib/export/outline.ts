import type { VidyaBoard, VidyaEdge, VidyaNode } from "../types";
import { buildHierarchy, getRoots } from "../layout/hierarchy";
import { formatRecordingDuration } from "../canvas/audio-recording";

export type OutlineTextFormat = "markdown" | "txt" | "html";

export interface OutlineDetail {
  label: string;
  value: string;
}

export interface OutlineNode {
  id: string;
  title: string;
  type: string;
  details: OutlineDetail[];
  children: OutlineNode[];
}

export interface OutlineConnection {
  source: string;
  target: string;
  label: string;
}

export interface OutlineDocument {
  title: string;
  description: string;
  roots: OutlineNode[];
  connections: OutlineConnection[];
  relationships: OutlineConnection[];
}

const NODE_TYPE_LABELS: Record<string, string> = {
  mindmap: "Mind map",
  sticky: "Sticky note",
  text: "Text",
  shape: "Shape",
  sanskrit: "Sanskrit card",
  shloka: "Shloka card",
  grammar: "Grammar card",
  frame: "Frame",
  audio: "Audio note",
  sunburst: "Radial chart",
  relationshipDiagram: "Relationship diagram",
};

const BLOCK_END_TAG = /<\/(?:address|article|aside|blockquote|div|figcaption|figure|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

/** Convert authored rich text to readable plain text without requiring a DOM. */
export function outlinePlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(BLOCK_END_TAG, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asText).filter(Boolean);
}

function firstLine(value: string): string {
  return value.split("\n").find(Boolean)?.trim() ?? "";
}

function nodeAuthoredText(node: VidyaNode): string {
  const data = node.data as Record<string, unknown>;
  return outlinePlainText(data.richText) || asText(data.text);
}

function nodeTitle(node: VidyaNode): string {
  const data = node.data as Record<string, unknown>;
  const authored = nodeAuthoredText(node);
  const relationshipSpec = data.relationshipDiagramSpec as Record<string, unknown> | undefined;
  const candidates = [
    firstLine(authored),
    asText(data.title),
    asText(data.topic),
    asText(data.label),
    asText(relationshipSpec?.title),
  ];
  return candidates.find(Boolean) || `Untitled ${nodeTypeLabel(node)}`;
}

function nodeTypeLabel(node: VidyaNode): string {
  if ((node.data as Record<string, unknown>).connectorJunction === true) {
    return "Connector junction";
  }
  return NODE_TYPE_LABELS[node.type ?? ""] ?? (node.type ? node.type : "Element");
}

function isOutlineContentNode(node: VidyaNode): boolean {
  const data = node.data as Record<string, unknown>;
  // Junctions and generated Matrix frames are implementation geometry rather
  // than authored outline content.
  return data.connectorJunction !== true && typeof data.matrixFrameFor !== "string";
}

function addDetail(
  details: OutlineDetail[],
  label: string,
  value: unknown,
  seen: Set<string>
): void {
  const text = Array.isArray(value)
    ? value.map(asText).filter(Boolean).join("; ")
    : asText(value);
  if (!text) return;
  const key = `${label}\u0000${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  details.push({ label, value: text });
}

function nodeDetails(node: VidyaNode, title: string): OutlineDetail[] {
  const data = node.data as Record<string, unknown>;
  const details: OutlineDetail[] = [];
  const seen = new Set<string>();
  const authoredText = nodeAuthoredText(node);
  if (authoredText && authoredText !== title) {
    addDetail(details, "Text", authoredText, seen);
  }

  switch (node.type) {
    case "sanskrit":
      addDetail(details, "Source", data.source, seen);
      addDetail(details, "Devanagari", data.devanagari, seen);
      addDetail(details, "IAST", data.iast, seen);
      addDetail(details, "Translation", data.translation, seen);
      addDetail(details, "Grammar notes", data.grammarNotes, seen);
      break;
    case "shloka":
      addDetail(details, "Source", data.sourceText, seen);
      addDetail(details, "Devanagari", data.devanagari, seen);
      addDetail(details, "IAST", data.iast, seen);
      addDetail(details, "Padaccheda", data.padaccheda, seen);
      addDetail(details, "Anvaya", data.anvaya, seen);
      addDetail(details, "Padartha", data.padartha, seen);
      addDetail(details, "Translation", data.translation, seen);
      addDetail(details, "Chandas", data.chandas, seen);
      addDetail(details, "Memorization status", data.memorizationStatus, seen);
      break;
    case "grammar":
      addDetail(details, "Category", data.category, seen);
      addDetail(details, "Rule", data.rule, seen);
      addDetail(details, "Examples", data.examples, seen);
      addDetail(details, "Exceptions", data.exceptions, seen);
      break;
    case "audio":
      addDetail(
        details,
        "Duration",
        typeof data.audioDurationMs === "number"
          ? formatRecordingDuration(data.audioDurationMs)
          : undefined,
        seen
      );
      addDetail(details, "Recorded", data.audioRecordedAt, seen);
      break;
    case "shape": {
      const layers = Array.isArray(data.concentricLayers)
        ? data.concentricLayers as Array<Record<string, unknown>>
        : [];
      addDetail(
        details,
        "Concentric layers",
        layers.map((layer) => asText(layer.text)).filter(Boolean),
        seen
      );
      const chart = data.radialChart as Record<string, unknown> | undefined;
      addDetail(details, "Chart center", chart?.centerText, seen);
      const rings = Array.isArray(chart?.rings)
        ? chart.rings as Array<Record<string, unknown>>
        : [];
      rings.forEach((ring, index) => {
        const segments = Array.isArray(ring.segments)
          ? ring.segments as Array<Record<string, unknown>>
          : [];
        addDetail(
          details,
          `Chart ring ${index + 1}`,
          segments.map((segment) => asText(segment.text)).filter(Boolean),
          seen
        );
      });
      break;
    }
    case "relationshipDiagram": {
      const spec = data.relationshipDiagramSpec as Record<string, unknown> | undefined;
      addDetail(details, "Subtitle", spec?.subtitle, seen);
      addDetail(details, "Layout", spec?.layout, seen);
      addDetail(details, "Relationship types", spec?.relationTypes, seen);
      break;
    }
  }

  addDetail(details, "Tags", asTextList(data.tags), seen);
  addDetail(details, "Notes", data.notes, seen);
  return details;
}

function compareByBoardPosition(
  first: VidyaNode,
  second: VidyaNode,
  sourceIndex: ReadonlyMap<string, number>
): number {
  const firstY = Number.isFinite(first.position?.y) ? first.position.y : 0;
  const secondY = Number.isFinite(second.position?.y) ? second.position.y : 0;
  const firstX = Number.isFinite(first.position?.x) ? first.position.x : 0;
  const secondX = Number.isFinite(second.position?.x) ? second.position.x : 0;
  return firstY - secondY
    || firstX - secondX
    || (sourceIndex.get(first.id) ?? 0) - (sourceIndex.get(second.id) ?? 0);
}

function hierarchyEdge(edge: VidyaEdge, parentByNode: ReadonlyMap<string, string | null>): boolean {
  return parentByNode.get(edge.target) === edge.source;
}

export function buildOutlineDocument(board: VidyaBoard): OutlineDocument {
  const contentNodes = board.content.nodes.filter(isOutlineContentNode);
  const contentIds = new Set(contentNodes.map((node) => node.id));
  const contentEdges = board.content.edges.filter(
    (edge) => contentIds.has(edge.source) && contentIds.has(edge.target)
  );
  const byId = new Map(contentNodes.map((node) => [node.id, node]));
  const hierarchyEdges = contentEdges.filter((edge) => {
    const targetData = byId.get(edge.target)?.data as Record<string, unknown> | undefined;
    if (typeof targetData?.parentId === "string") return true;
    if (
      targetData
      && Object.prototype.hasOwnProperty.call(targetData, "parentId")
    ) {
      return false;
    }
    // Legacy boards may rely on an unlabeled directed edge for hierarchy.
    // Labeled edges are semantic cross-links and must not reparent a root.
    return !asText(edge.data?.label);
  });
  const hierarchy = buildHierarchy(contentNodes, hierarchyEdges);
  const sourceIndex = new Map(contentNodes.map((node, index) => [node.id, index]));
  const parentByNode = new Map(
    [...hierarchy].map(([id, item]) => [id, item.parentId] as const)
  );

  const visit = (id: string, visiting: Set<string>): OutlineNode | null => {
    if (visiting.has(id)) return null;
    const node = byId.get(id);
    if (!node) return null;
    const nextVisiting = new Set(visiting).add(id);
    const title = nodeTitle(node);
    return {
      id,
      title,
      type: nodeTypeLabel(node),
      details: nodeDetails(node, title),
      children: (hierarchy.get(id)?.childIds ?? [])
        .map((childId) => visit(childId, nextVisiting))
        .filter((child): child is OutlineNode => child !== null),
    };
  };

  const roots = getRoots(hierarchy)
    .map((id) => byId.get(id))
    .filter((node): node is VidyaNode => Boolean(node))
    .sort((first, second) => compareByBoardPosition(first, second, sourceIndex))
    .map((node) => visit(node.id, new Set()))
    .filter((node): node is OutlineNode => node !== null);

  const connections = contentEdges.flatMap((edge): OutlineConnection[] => {
    const label = asText(edge.data?.label);
    if (hierarchyEdge(edge, parentByNode) && !label) return [];
    return [{
      source: nodeTitle(byId.get(edge.source)!),
      target: nodeTitle(byId.get(edge.target)!),
      label: label || "Connection",
    }];
  });

  const relationshipKeys = new Set<string>();
  const relationships = (board.content.relationships ?? []).flatMap(
    (relationship): OutlineConnection[] => {
      const source = byId.get(relationship.sourceNodeId);
      const target = byId.get(relationship.targetNodeId);
      if (!source || !target) return [];
      const item = {
        source: nodeTitle(source),
        target: nodeTitle(target),
        label: asText(relationship.relationType) || "Relationship",
      };
      const key = `${item.source}\u0000${item.target}\u0000${item.label}`;
      if (relationshipKeys.has(key)) return [];
      relationshipKeys.add(key);
      return [item];
    }
  );

  return {
    title: asText(board.title) || "Untitled board",
    description: asText(board.description),
    roots,
    connections,
    relationships,
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function markdownDetailValue(value: string): string {
  return escapeMarkdown(value).replace(/\n/g, "<br>");
}

function markdownNodes(nodes: readonly OutlineNode[], depth = 0): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    const indent = "    ".repeat(depth);
    lines.push(`${indent}1. **${escapeMarkdown(node.title)}**`);
    for (const detail of node.details) {
      lines.push(
        `${indent}    - **${escapeMarkdown(detail.label)}:** ${markdownDetailValue(detail.value)}`
      );
    }
    lines.push(...markdownNodes(node.children, depth + 1));
  }
  return lines;
}

function markdownConnections(
  heading: string,
  connections: readonly OutlineConnection[]
): string[] {
  if (!connections.length) return [];
  return [
    `## ${heading}`,
    "",
    ...connections.map((connection) =>
      `- ${escapeMarkdown(connection.source)} -> ${escapeMarkdown(connection.target)}: ${escapeMarkdown(connection.label)}`
    ),
    "",
  ];
}

export function serializeOutlineMarkdown(outline: OutlineDocument): string {
  const lines = [`# ${escapeMarkdown(outline.title)}`, ""];
  if (outline.description) lines.push(escapeMarkdown(outline.description), "");
  lines.push("## Outline", "");
  if (outline.roots.length) lines.push(...markdownNodes(outline.roots));
  else lines.push("_No outline content._");
  lines.push(
    "",
    ...markdownConnections("Connections", outline.connections),
    ...markdownConnections("Relationships", outline.relationships)
  );
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function textNodes(
  nodes: readonly OutlineNode[],
  depth = 0,
  path: number[] = []
): string[] {
  const lines: string[] = [];
  nodes.forEach((node, index) => {
    const nodePath = [...path, index + 1];
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${nodePath.join(".")}. ${node.title}`);
    for (const detail of node.details) {
      const detailIndent = "  ".repeat(depth + 1);
      const detailLines = detail.value.split("\n");
      lines.push(`${detailIndent}${detail.label}: ${detailLines[0]}`);
      for (const continuation of detailLines.slice(1)) {
        lines.push(`${detailIndent}  ${continuation}`);
      }
    }
    lines.push(...textNodes(node.children, depth + 1, nodePath));
  });
  return lines;
}

function textConnections(
  heading: string,
  connections: readonly OutlineConnection[]
): string[] {
  if (!connections.length) return [];
  return [
    "",
    heading,
    "-".repeat(heading.length),
    ...connections.map((connection) =>
      `- ${connection.source} -> ${connection.target}: ${connection.label}`
    ),
  ];
}

export function serializeOutlineText(outline: OutlineDocument): string {
  const titleRule = "=".repeat(Math.max(3, outline.title.length));
  const lines = [outline.title, titleRule];
  if (outline.description) lines.push("", outline.description);
  lines.push("", "Outline", "-------");
  if (outline.roots.length) lines.push(...textNodes(outline.roots));
  else lines.push("No outline content.");
  lines.push(
    ...textConnections("Connections", outline.connections),
    ...textConnections("Relationships", outline.relationships)
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function htmlNodes(
  nodes: readonly OutlineNode[],
  path: number[] = []
): string {
  if (!nodes.length) return "";
  const items = nodes.map((node, index) => {
    const nodePath = [...path, index + 1];
    const details = node.details.length
      ? `<dl>${node.details.map((detail) =>
          `<div><dt>${escapeHtml(detail.label)}</dt><dd dir="auto">${htmlText(detail.value)}</dd></div>`
        ).join("")}</dl>`
      : "";
    return [
      "<li>",
      "<article class=\"outline-node\">",
      `<header><span class="outline-number">${nodePath.join(".")}.</span>`,
      `<span class="outline-title" dir="auto">${escapeHtml(node.title)}</span></header>`,
      details,
      "</article>",
      htmlNodes(node.children, nodePath),
      "</li>",
    ].join("");
  }).join("");
  return `<ol class="outline-list">${items}</ol>`;
}

function htmlConnections(
  heading: string,
  connections: readonly OutlineConnection[]
): string {
  if (!connections.length) return "";
  return [
    `<section><h2>${escapeHtml(heading)}</h2><ul class="connection-list">`,
    ...connections.map((connection) =>
      `<li><span dir="auto">${escapeHtml(connection.source)}</span> <span aria-label="to">-&gt;</span> <span dir="auto">${escapeHtml(connection.target)}</span>: <strong dir="auto">${escapeHtml(connection.label)}</strong></li>`
    ),
    "</ul></section>",
  ].join("");
}

export function serializeOutlineHtml(outline: OutlineDocument): string {
  const content = outline.roots.length
    ? htmlNodes(outline.roots)
    : "<p class=\"empty\">No outline content.</p>";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(outline.title)} - Outline</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif; color: #172033; background: #f3f5f9; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2rem; }
    main { width: min(56rem, 100%); margin: 0 auto; padding: 3rem; background: #fff; border: 1px solid #dce2ec; border-radius: 1rem; box-shadow: 0 1rem 3rem rgb(15 23 42 / 8%); }
    h1 { margin: 0; font-size: 2rem; line-height: 1.2; color: #111827; }
    .description { margin: .75rem 0 0; color: #526076; white-space: pre-line; }
    h2 { margin: 2.25rem 0 1rem; padding-bottom: .5rem; border-bottom: 2px solid #dbeafe; font-size: 1.2rem; color: #1d4ed8; }
    .outline-list { list-style: none; margin: 0; padding-left: 1.45rem; border-left: 1px solid #dbe3ef; }
    section > .outline-list { padding-left: 0; border-left: 0; }
    .outline-list > li { position: relative; margin: .7rem 0; }
    .outline-list > li::before { content: ""; position: absolute; left: -1.45rem; top: 1rem; width: 1rem; border-top: 1px solid #dbe3ef; }
    section > .outline-list > li::before { display: none; }
    .outline-node { padding: .8rem 1rem; border: 1px solid #e2e8f0; border-radius: .7rem; background: #fff; break-inside: avoid; }
    .outline-node header { display: flex; align-items: baseline; flex-wrap: wrap; gap: .5rem; }
    .outline-number { min-width: 2rem; color: #2563eb; font-variant-numeric: tabular-nums; font-weight: 700; }
    .outline-title { font-weight: 700; }
    dl { margin: .55rem 0 0 2.5rem; color: #475569; font-size: .9rem; }
    dl div { display: grid; grid-template-columns: minmax(7rem, max-content) 1fr; gap: .5rem; margin-top: .3rem; }
    dt { font-weight: 650; color: #334155; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .connection-list { padding-left: 1.25rem; color: #334155; }
    .connection-list li { margin: .45rem 0; }
    .empty { color: #64748b; font-style: italic; }
    @media (max-width: 640px) { body { padding: 0; } main { padding: 1.25rem; border: 0; border-radius: 0; } dl { margin-left: 0; } dl div { grid-template-columns: 1fr; gap: .1rem; } }
    @media print { body { padding: 0; background: #fff; } main { width: 100%; padding: 0; border: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1 dir="auto">${escapeHtml(outline.title)}</h1>
      ${outline.description ? `<p class="description" dir="auto">${htmlText(outline.description)}</p>` : ""}
    </header>
    <section>
      <h2>Outline</h2>
      ${content}
    </section>
    ${htmlConnections("Connections", outline.connections)}
    ${htmlConnections("Relationships", outline.relationships)}
  </main>
</body>
</html>
`;
}

export function outlineFilename(
  title: string,
  extension: "md" | "txt" | "html" | "pdf"
): string {
  const base = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "") || "outline";
  return `${base}.${extension}`;
}
