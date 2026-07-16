import type {
  RelationshipDiagramItemStyle,
  RelationshipDiagramPalette,
  RelationshipDiagramSpec,
} from "./types";

export interface RelationshipDiagramColorItem {
  itemId: string;
  sourceNodeId: string;
  sourceColor?: string;
}

type RelationshipDiagramColorSpec = Pick<RelationshipDiagramSpec, "itemStyles" | "palette">;

const RELATIONSHIP_DIAGRAM_PALETTES: Record<
  Exclude<RelationshipDiagramPalette, "source">,
  string[]
> = {
  spectrum: ["#ef4444", "#f59e0b", "#84cc16", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"],
  warm: ["#b91c1c", "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#be123c"],
  cool: ["#0f766e", "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed"],
  pastel: ["#f9a8d4", "#c4b5fd", "#93c5fd", "#99f6e4", "#bef264", "#fde68a", "#fdba74"],
  monochrome: ["#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"],
};

export function relationshipDiagramPaletteColor(
  index: number,
  palette: RelationshipDiagramPalette
): string {
  const colors = palette === "source"
    ? RELATIONSHIP_DIAGRAM_PALETTES.spectrum
    : RELATIONSHIP_DIAGRAM_PALETTES[palette];
  const normalizedIndex = ((index % colors.length) + colors.length) % colors.length;
  return colors[normalizedIndex];
}

export function relationshipDiagramItemStyle(
  item: RelationshipDiagramColorItem,
  spec: RelationshipDiagramColorSpec
): RelationshipDiagramItemStyle {
  return {
    ...(spec.itemStyles?.[item.sourceNodeId] ?? {}),
    ...(spec.itemStyles?.[item.itemId] ?? {}),
  };
}

export function relationshipDiagramItemColor(
  item: RelationshipDiagramColorItem,
  index: number,
  spec: RelationshipDiagramColorSpec
): string {
  const customFill = relationshipDiagramItemStyle(item, spec).fillColor?.trim();
  if (customFill) return customFill;

  const sourceColor = item.sourceColor?.trim();
  if (spec.palette === "source" && sourceColor) return sourceColor;

  return relationshipDiagramPaletteColor(index, spec.palette);
}
