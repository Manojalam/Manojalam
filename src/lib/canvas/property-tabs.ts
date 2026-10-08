import type { Node, Edge } from "@xyflow/react";

import { buildHierarchy } from "@/lib/layout/hierarchy";

/** Context is derived from the object, never from its template. */
export function objectPropertiesLabel(node: Node | undefined, nodes: Node[] = [], edges: Edge[] = []): string | null {
  if (!node) return null;
  const d = node.data;
  if (node.type === "table") return "Table";
  if (d.layoutMode === "matrix" || d.matrixRootId) return "Matrix";
  if (node.type === "sunburst" || d.sunburstHiddenFor || d.layoutMode === "radial" || (d.radialChart as { enabled?: boolean } | undefined)?.enabled) return "Radial";
  if (node.type === "relationshipDiagram") return "Diagram";
  if (d.layoutMode === "list") return "List";
  if (d.layoutMode === "mindMap") return "Mind map";
  if (["horizontal", "vertical", "topDown", "linear"].includes(String(d.layoutMode))) return "Tree";
  const hierarchy = buildHierarchy(nodes, edges);
  const seen = new Set<string>([node.id]);
  let parent = hierarchy.get(node.id)?.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const ancestor = nodes.find(item => item.id === parent);
    if (ancestor?.data.layoutMode && !["freeForm", "fromParentFreeForm"].includes(String(ancestor.data.layoutMode))) return objectPropertiesLabel(ancestor);
    parent = hierarchy.get(parent)?.parentId;
  }
  if (node.type === "mindmap") return "Mind map";
  if (node.type === "shape") return "Shape";
  if (node.type === "frame") return "Frame";
  return null;
}
