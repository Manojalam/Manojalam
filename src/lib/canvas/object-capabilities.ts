/** One capability contract for the inspector. Templates do not change capabilities. */
export interface ObjectCapabilities { text: boolean; surface: boolean; dimensions: boolean; paragraphs: boolean }
const textObject = { text: true, surface: true, dimensions: true, paragraphs: true };
export const OBJECT_CAPABILITIES: Record<string, ObjectCapabilities> = {
  shape: textObject, mindmap: textObject, text: textObject, sticky: textObject,
  table: textObject, sanskrit: textObject, shloka: textObject, grammar: textObject,
  frame: textObject,
  sunburst: { ...textObject, paragraphs: false },
  relationshipDiagram: { ...textObject, paragraphs: false },
  audio: { text: false, surface: false, dimensions: true, paragraphs: false },
  junction: { text: false, surface: false, dimensions: false, paragraphs: false },
};
export function objectCapabilities(type: string | undefined): ObjectCapabilities {
  return OBJECT_CAPABILITIES[type ?? ""] ?? { text: false, surface: false, dimensions: true, paragraphs: false };
}
