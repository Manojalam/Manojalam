import type { VidyaBoard, VidyaNode } from "@/lib/types";

function getNodeText(node: VidyaNode): string {
  const d = node.data;
  if ("text" in d && d.text) return String(d.text);
  if ("title" in d && d.title) return String(d.title);
  if ("topic" in d && d.topic) return String(d.topic);
  if ("label" in d && d.label) return String(d.label);
  return "Untitled";
}

function formatSanskritCard(node: VidyaNode): string {
  const d = node.data as Record<string, unknown>;
  let md = `## Sanskrit Card: ${d.title ?? "Untitled"}\n\n`;
  if (d.source) md += `*Source:* ${d.source}\n\n`;
  if (d.devanagari) md += `### Devanāgarī\n${d.devanagari}\n\n`;
  if (d.iast) md += `### IAST\n${d.iast}\n\n`;
  if (d.translation) md += `### Translation\n${d.translation}\n\n`;
  if (d.grammarNotes) md += `### Grammar Notes\n${d.grammarNotes}\n\n`;
  if (Array.isArray(d.tags) && d.tags.length)
    md += `*Tags:* ${(d.tags as string[]).join(", ")}\n\n`;
  return md;
}

function formatShlokaCard(node: VidyaNode): string {
  const d = node.data as Record<string, unknown>;
  let md = `## Śloka: ${d.title ?? "Untitled"}\n\n`;
  if (d.sourceText) md += `*Source:* ${d.sourceText}\n\n`;
  if (d.devanagari) md += `### Devanāgarī\n${d.devanagari}\n\n`;
  if (d.iast) md += `### IAST\n${d.iast}\n\n`;
  if (d.padaccheda) md += `### Padaccheda\n${d.padaccheda}\n\n`;
  if (d.anvaya) md += `### Anvaya\n${d.anvaya}\n\n`;
  if (d.padartha) md += `### Padārtha\n${d.padartha}\n\n`;
  if (d.translation) md += `### Translation\n${d.translation}\n\n`;
  if (d.chandas) md += `### Chandas\n${d.chandas}\n\n`;
  if (d.notes) md += `### Notes\n${d.notes}\n\n`;
  return md;
}

function formatGrammarCard(node: VidyaNode): string {
  const d = node.data as Record<string, unknown>;
  let md = `## Grammar: ${d.topic ?? "Untitled"}\n\n`;
  if (d.category) md += `*Category:* ${d.category}\n\n`;
  if (d.rule) md += `### Rule\n${d.rule}\n\n`;
  if (Array.isArray(d.examples))
    md += `### Examples\n${(d.examples as string[]).map((e) => `- ${e}`).join("\n")}\n\n`;
  if (d.exceptions) md += `### Exceptions\n${d.exceptions}\n\n`;
  return md;
}

export function exportToMarkdown(board: VidyaBoard): string {
  let md = `# ${board.title}\n\n`;
  if (board.description) md += `${board.description}\n\n`;

  const mindmapNodes = board.content.nodes.filter((n) => n.type === "mindmap");
  const specialNodes = board.content.nodes.filter(
    (n) => n.type === "sanskrit" || n.type === "shloka" || n.type === "grammar"
  );
  const otherNodes = board.content.nodes.filter(
    (n) =>
      !["mindmap", "sanskrit", "shloka", "grammar"].includes(n.type ?? "")
  );

  if (mindmapNodes.length) {
    md += `## Mind Map\n\n`;
    for (const node of mindmapNodes) {
      md += `- ${getNodeText(node)}`;
      const tags = (node.data as { tags?: string[] }).tags;
      if (tags?.length) md += ` *[${tags.join(", ")}]*`;
      md += `\n`;
    }
    md += `\n`;
  }

  for (const node of specialNodes) {
    if (node.type === "sanskrit") md += formatSanskritCard(node);
    else if (node.type === "shloka") md += formatShlokaCard(node);
    else if (node.type === "grammar") md += formatGrammarCard(node);
  }

  if (otherNodes.length) {
    md += `## Other Elements\n\n`;
    for (const node of otherNodes) {
      md += `- **${node.type}:** ${getNodeText(node)}\n`;
    }
  }

  const labeledEdges = board.content.edges.filter((e) => e.data?.label);
  if (labeledEdges.length) {
    md += `\n## Connections\n\n`;
    for (const edge of labeledEdges) {
      md += `- ${edge.source} → ${edge.target}: ${edge.data?.label}\n`;
    }
  }

  return md;
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(board: VidyaBoard) {
  const json = JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), board },
    null,
    2
  );
  downloadFile(json, `${board.title.replace(/\s+/g, "-")}.vidyamap.json`, "application/json");
}

export function downloadMarkdown(board: VidyaBoard) {
  downloadFile(
    exportToMarkdown(board),
    `${board.title.replace(/\s+/g, "-")}.md`,
    "text/markdown"
  );
}
