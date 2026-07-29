import type { Edge, Node } from "@xyflow/react";
import { buildHierarchy, getRoots } from "../layout/hierarchy";
import { getNodeRect } from "../layout/geometry";

const NON_CONTENT_NODE_TYPES = new Set([
  "frame",
  "junction",
  "relationshipDiagram",
  "sunburst",
]);

function participatesInHierarchyNumbering(node: Node): boolean {
  if (NON_CONTENT_NODE_TYPES.has(node.type ?? "")) return false;
  return (node.data as { externalNote?: unknown } | undefined)?.externalNote !== true;
}

/**
 * Derive outline-style numbers from the board hierarchy without changing any
 * authored labels. Roots and siblings are one-based; descendants append their
 * sibling index (for example 1, 1.1, 1.2, 1.2.1).
 */
export function hierarchyNumberMap(nodes: Node[], edges: Edge[]): Map<string, string> {
  const contentNodes = nodes.filter(participatesInHierarchyNumbering);
  const contentNodeIds = new Set(contentNodes.map((node) => node.id));
  const hierarchy = buildHierarchy(
    contentNodes,
    edges.filter((edge) => contentNodeIds.has(edge.source) && contentNodeIds.has(edge.target))
  );
  const nodeById = new Map(contentNodes.map((node) => [node.id, node]));
  const roots = getRoots(hierarchy).sort((leftId, rightId) => {
    const left = getNodeRect(nodeById.get(leftId)!);
    const right = getNodeRect(nodeById.get(rightId)!);
    return left.centerY - right.centerY || left.centerX - right.centerX;
  });
  const numbers = new Map<string, string>();

  const visit = (nodeId: string, number: string) => {
    numbers.set(nodeId, number);
    const childIds = hierarchy.get(nodeId)?.childIds ?? [];
    childIds.forEach((childId, index) => visit(childId, `${number}.${index + 1}`));
  };

  roots.forEach((rootId, index) => visit(rootId, String(index + 1)));
  return numbers;
}

export function prependHierarchyNumber(label: string, number: string | undefined): string {
  return number ? `${number} ${label}`.trimEnd() : label;
}

/**
 * Add a presentation-only number to the first rich-text block. Callers must
 * continue persisting the original HTML, never this derived display value.
 */
export function prependHierarchyNumberToRichText(
  html: string,
  number: string | undefined
): string {
  if (!number) return html;
  const prefix = `${number.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}&nbsp;`;
  if (!html.trim()) return `<p>${prefix}</p>`;
  const firstBlock = /<(p|h[1-6])(\s[^>]*)?>/i;
  if (firstBlock.test(html)) {
    return html.replace(firstBlock, (openingTag) => `${openingTag}${prefix}`);
  }
  return `${prefix}${html}`;
}
