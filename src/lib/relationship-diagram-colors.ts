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
  calm: ["#d08a83", "#d3a462", "#a6b575", "#69aa9c", "#6f9fc0", "#8b84b8", "#bd839f"],
  spectrum: ["#dc7774", "#dda15e", "#a8b85f", "#55ad9b", "#5d9fc6", "#8178c4", "#c875a1"],
  warm: ["#c77974", "#cf8768", "#d39b62", "#c4a66a", "#b88779", "#bd748a"],
  cool: ["#5f9f96", "#62a6b4", "#659bc1", "#748ac0", "#8582b8", "#9a7eae"],
  pastel: ["#eab7c8", "#d5c2e8", "#b8d3e7", "#b8ded5", "#d5e0b2", "#eadbad", "#e9c5ae"],
  monochrome: ["#536472", "#687986", "#7e8e99", "#96a4ad", "#b1bbc1"],
};

export function relationshipDiagramPaletteColor(
  index: number,
  palette: RelationshipDiagramPalette
): string {
  const colors = palette === "source"
    ? RELATIONSHIP_DIAGRAM_PALETTES.calm
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
