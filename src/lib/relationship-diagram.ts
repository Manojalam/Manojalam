import type { Node } from "@xyflow/react";

import { getSubtree, type Hierarchy } from "@/lib/layout/hierarchy";
import {
  canonicalRelationshipType,
  nodeDisplayLabel,
} from "@/lib/relationships";
import type {
  NodeRelationship,
  RelationshipDiagramDecorativeLevel,
  RelationshipDiagramDensity,
  RelationshipDiagramLayout,
  RelationshipDiagramPalette,
  RelationshipDiagramScope,
  RelationshipDiagramScopeMode,
  RelationshipDiagramSourceSort,
  RelationshipDiagramSpec,
  RelationshipDiagramItemStyle,
  RelationshipDiagramTargetSort,
} from "@/lib/types";
import {
  DEFAULT_FLOWER_PETALS_PER_LAYER,
  normalizeFlowerLayerCount,
  normalizeFlowerPetalsPerLayer,
} from "@/lib/canvas/relationship-flower-layout";
import {
  splitSingleSourceRelationshipItems,
  type RelationshipDiagramItemGroup,
} from "@/lib/relationship-diagram-items";

export {
  DEFAULT_FLOWER_PETALS_PER_LAYER,
  MAX_FLOWER_PETALS_PER_LAYER,
  MAX_FLOWER_LAYERS,
  MIN_FLOWER_PETALS_PER_LAYER,
} from "@/lib/canvas/relationship-flower-layout";

export const RELATIONSHIP_DIAGRAM_SPEC_VERSION = 1;

export const RELATIONSHIP_DIAGRAM_LAYOUTS = [
  "flower",
  "matrix",
  "card-grid",
  "radial-hub",
  "arc-fan",
] as const satisfies readonly RelationshipDiagramLayout[];

export const RELATIONSHIP_DIAGRAM_PALETTES = [
  "source",
  "spectrum",
  "warm",
  "cool",
  "pastel",
  "monochrome",
] as const satisfies readonly RelationshipDiagramPalette[];

export const RELATIONSHIP_DIAGRAM_DENSITIES = [
  "compact",
  "comfortable",
  "spacious",
] as const satisfies readonly RelationshipDiagramDensity[];

export const DEFAULT_RELATIONSHIP_DIAGRAM_SPEC: Readonly<RelationshipDiagramSpec> = {
  version: RELATIONSHIP_DIAGRAM_SPEC_VERSION,
  layout: "flower",
  scope: {
    mode: "selected-nodes",
    sourceNodeIds: [],
  },
  relationTypes: [],
  title: "Relationship Diagram",
  subtitle: "",
  showCounts: true,
  showIcons: false,
  palette: "source",
  textSize: 16,
  maximizeLabelText: false,
  density: "comfortable",
  flowerPetalsPerLayer: DEFAULT_FLOWER_PETALS_PER_LAYER,
  flowerLayerCount: 0,
  decorativeLevel: "balanced",
  background: "transparent",
  sortSources: "natural",
  sortTargets: "natural",
};

export type RelationshipGroupTarget = RelationshipDiagramItemGroup["targets"][number];

/** Layout-neutral relationship data. Presets must not read board geometry. */
export interface RelationshipGroup extends RelationshipDiagramItemGroup {
  sourceLabel: string;
  sourceIcon?: string;
}

export interface BuildRelationshipGroupsOptions {
  nodes: readonly Node[];
  relationships: readonly NodeRelationship[];
  /** Omit to include every relationship source; an explicit empty array includes none. */
  sourceNodeIds?: readonly string[];
  /** Optional ordering hint for targets, such as depth-first chart order. */
  targetNodeIds?: readonly string[];
  /** Omit or pass an empty array to include every relationship type. */
  relationTypes?: readonly string[];
  sortSources?: RelationshipDiagramSourceSort;
  sortTargets?: RelationshipDiagramTargetSort;
}

export interface BuildRelationshipGroupsForSpecOptions {
  spec: RelationshipDiagramSpec;
  nodes: readonly Node[];
  relationships: readonly NodeRelationship[];
  hierarchy?: Hierarchy;
  targetNodeIds?: readonly string[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result || null;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function isTransparentRelationshipDiagramBackground(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const token = value.trim().toLocaleLowerCase().replace(/\s+/gu, "");
  return !token
    || token === "transparent"
    || token === "none"
    || token === "rgba(0,0,0,0)"
    || token === "hsla(0,0%,0%,0)";
}

function normalizeBackground(value: unknown): string {
  const background = textValue(value, DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.background);
  return isTransparentRelationshipDiagramBackground(background)
    ? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.background
    : background;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const normalized = nonEmptyString(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeItemStyles(value: unknown): Record<string, RelationshipDiagramItemStyle> | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const result: Record<string, RelationshipDiagramItemStyle> = {};
  for (const [nodeId, candidate] of Object.entries(raw)) {
    const style = asRecord(candidate);
    if (!nodeId.trim() || !style) continue;
    const fillColor = optionalString(style.fillColor);
    const borderColor = optionalString(style.borderColor);
    const textColor = optionalString(style.textColor);
    const fontSize = style.fontSize === undefined
      ? undefined
      : clamp(finiteNumber(style.fontSize, 16), 8, 72);
    const rotation = style.rotation === undefined
      ? undefined
      : clamp(finiteNumber(style.rotation, 0), -180, 180);
    const flowerLayer = style.flowerLayer === undefined
      ? undefined
      : normalizeFlowerLayerCount(style.flowerLayer) || undefined;
    const normalized: RelationshipDiagramItemStyle = {
      ...(fillColor ? { fillColor } : {}),
      ...(borderColor ? { borderColor } : {}),
      ...(textColor ? { textColor } : {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(rotation !== undefined ? { rotation } : {}),
      ...(flowerLayer !== undefined ? { flowerLayer } : {}),
    };
    if (Object.keys(normalized).length) result[nodeId] = normalized;
  }
  return Object.keys(result).length ? result : undefined;
}

function canonicalRelationshipTypes(value: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of uniqueStrings(value)) {
    const relationType = canonicalRelationshipType(candidate);
    if (!relationType || seen.has(relationType)) continue;
    seen.add(relationType);
    result.push(relationType);
  }
  return result;
}

function normalizedToken(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase().replace(/[\s_]+/gu, "-")
    : "";
}

function normalizeLayout(value: unknown): RelationshipDiagramLayout {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramLayout>> = {
    flower: "flower",
    matrix: "matrix",
    cards: "card-grid",
    "card-grid": "card-grid",
    cardgrid: "card-grid",
    hub: "radial-hub",
    radial: "radial-hub",
    "radial-hub": "radial-hub",
    radialhub: "radial-hub",
    arc: "arc-fan",
    fan: "arc-fan",
    "arc-fan": "arc-fan",
    arcfan: "arc-fan",
  };
  return aliases[token] ?? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.layout;
}

function normalizeScopeMode(
  value: unknown,
  sourceNodeIds: readonly string[]
): RelationshipDiagramScopeMode {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramScopeMode>> = {
    node: "selected-node",
    selected: "selected-node",
    "selected-node": "selected-node",
    nodes: "selected-nodes",
    "selected-nodes": "selected-nodes",
    branch: "selected-branch",
    subtree: "selected-branch",
    "selected-branch": "selected-branch",
  };
  return aliases[token] ?? (sourceNodeIds.length === 1 ? "selected-node" : "selected-nodes");
}

function normalizePalette(value: unknown): RelationshipDiagramPalette {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramPalette>> = {
    inherit: "source",
    source: "source",
    "source-color": "source",
    "source-colors": "source",
    spectrum: "spectrum",
    rainbow: "spectrum",
    warm: "warm",
    cool: "cool",
    pastel: "pastel",
    monochrome: "monochrome",
    grayscale: "monochrome",
    greyscale: "monochrome",
  };
  return aliases[token] ?? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.palette;
}

function normalizeDensity(value: unknown): RelationshipDiagramDensity {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramDensity>> = {
    compact: "compact",
    dense: "compact",
    comfortable: "comfortable",
    normal: "comfortable",
    spacious: "spacious",
    presentation: "spacious",
  };
  return aliases[token] ?? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.density;
}

function normalizeDecorativeLevel(value: unknown): RelationshipDiagramDecorativeLevel {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramDecorativeLevel>> = {
    minimal: "minimal",
    plain: "minimal",
    balanced: "balanced",
    standard: "balanced",
    ornate: "ornate",
    decorative: "ornate",
  };
  return aliases[token] ?? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.decorativeLevel;
}

function normalizeSourceSort(value: unknown): RelationshipDiagramSourceSort {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramSourceSort>> = {
    natural: "natural",
    manual: "natural",
    "source-order": "natural",
    "chart-order": "natural",
    alphabetical: "label-asc",
    "a-z": "label-asc",
    "label-asc": "label-asc",
    "z-a": "label-desc",
    "label-desc": "label-desc",
    "count-asc": "count-asc",
    "count-desc": "count-desc",
    "most-related": "count-desc",
    "least-related": "count-asc",
  };
  return aliases[token] ?? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.sortSources;
}

function normalizeTargetSort(value: unknown): RelationshipDiagramTargetSort {
  const token = normalizedToken(value);
  const aliases: Readonly<Record<string, RelationshipDiagramTargetSort>> = {
    natural: "natural",
    manual: "natural",
    "source-order": "natural",
    "chart-order": "natural",
    alphabetical: "label-asc",
    "a-z": "label-asc",
    "label-asc": "label-asc",
    "z-a": "label-desc",
    "label-desc": "label-desc",
  };
  return aliases[token] ?? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.sortTargets;
}

function optionValue(
  raw: UnknownRecord,
  legacyOptions: UnknownRecord,
  key: string,
  ...legacyKeys: string[]
): unknown {
  const keys = [key, ...legacyKeys];
  for (const candidate of keys) {
    const value = raw[candidate] ?? legacyOptions[candidate];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function normalizeRelationshipDiagramScope(
  value: unknown,
  fallback: Partial<RelationshipDiagramScope> = {}
): RelationshipDiagramScope {
  const raw = asRecord(value) ?? {};
  const sourceNodeIds = uniqueStrings(
    raw.sourceNodeIds ?? raw.nodeIds ?? fallback.sourceNodeIds ?? []
  );
  const mode = normalizeScopeMode(raw.mode ?? raw.kind ?? fallback.mode, sourceNodeIds);
  const legacyBranchRootNodeId = nonEmptyString(
    raw.branchRootNodeId ?? raw.rootNodeId ?? fallback.branchRootNodeId
  );
  let branchRootNodeIds = uniqueStrings(
    raw.branchRootNodeIds ?? fallback.branchRootNodeIds ?? []
  );
  if (!branchRootNodeIds.length && legacyBranchRootNodeId) {
    branchRootNodeIds = [legacyBranchRootNodeId];
  }
  if (mode === "selected-branch" && !branchRootNodeIds.length) {
    branchRootNodeIds = [...sourceNodeIds];
  }
  const chartRootNodeId = nonEmptyString(raw.chartRootNodeId ?? fallback.chartRootNodeId);
  const normalizedSourceIds = mode === "selected-node"
    ? sourceNodeIds.slice(0, 1)
    : sourceNodeIds;

  return {
    mode,
    sourceNodeIds: normalizedSourceIds,
    ...(mode === "selected-branch" && branchRootNodeIds.length
      ? { branchRootNodeIds }
      : {}),
    ...(chartRootNodeId ? { chartRootNodeId } : {}),
  };
}

/**
 * Accepts the current schema and early flattened/nested drafts. Invalid data
 * falls back field-by-field instead of invalidating an otherwise usable node.
 */
export function normalizeRelationshipDiagramSpec(
  value: unknown,
  fallbackScope: Partial<RelationshipDiagramScope> = {}
): RelationshipDiagramSpec {
  const raw = asRecord(value) ?? {};
  const legacyOptions = asRecord(raw.options) ?? {};
  const storedScopeValue = raw.scope ?? legacyOptions.scope;
  const storedScope = asRecord(storedScopeValue);
  const legacyScope = storedScope ?? {
    mode: typeof storedScopeValue === "string"
      ? storedScopeValue
      : optionValue(raw, legacyOptions, "scopeMode"),
    sourceNodeIds: optionValue(raw, legacyOptions, "sourceNodeIds", "nodeIds"),
    branchRootNodeIds: optionValue(raw, legacyOptions, "branchRootNodeIds"),
    branchRootNodeId: optionValue(raw, legacyOptions, "branchRootNodeId", "rootNodeId"),
    chartRootNodeId: optionValue(raw, legacyOptions, "chartRootNodeId"),
  };

  const itemOrder = uniqueStrings(optionValue(raw, legacyOptions, "itemOrder"));
  const itemStyles = normalizeItemStyles(optionValue(raw, legacyOptions, "itemStyles"));
  const fontFamily = optionalString(optionValue(raw, legacyOptions, "fontFamily"));
  const textColor = optionalString(optionValue(raw, legacyOptions, "textColor"));
  const borderColor = optionalString(optionValue(raw, legacyOptions, "borderColor"));
  const centerFillColor = optionalString(optionValue(raw, legacyOptions, "centerFillColor"));
  const centerBorderColor = optionalString(optionValue(raw, legacyOptions, "centerBorderColor"));
  const centerTextColor = optionalString(optionValue(raw, legacyOptions, "centerTextColor"));
  const fontWeight = optionValue(raw, legacyOptions, "fontWeight") === "bold"
    ? "bold" as const
    : optionValue(raw, legacyOptions, "fontWeight") === "normal"
      ? "normal" as const
      : undefined;
  const fontStyle = optionValue(raw, legacyOptions, "fontStyle") === "italic"
    ? "italic" as const
    : optionValue(raw, legacyOptions, "fontStyle") === "normal"
      ? "normal" as const
      : undefined;
  const borderWidthValue = optionValue(raw, legacyOptions, "borderWidth");
  const fillOpacityValue = optionValue(raw, legacyOptions, "fillOpacity");
  const centerBorderWidthValue = optionValue(raw, legacyOptions, "centerBorderWidth");
  const flowerLayerCountValue = optionValue(
    raw,
    legacyOptions,
    "flowerLayerCount",
    "flowerLayers"
  );

  return {
    version: RELATIONSHIP_DIAGRAM_SPEC_VERSION,
    layout: normalizeLayout(optionValue(raw, legacyOptions, "layout")),
    scope: normalizeRelationshipDiagramScope(legacyScope, fallbackScope),
    relationTypes: canonicalRelationshipTypes(
      optionValue(raw, legacyOptions, "relationTypes", "relationshipTypes")
    ),
    title: textValue(
      optionValue(raw, legacyOptions, "title"),
      DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.title
    ),
    subtitle: textValue(
      optionValue(raw, legacyOptions, "subtitle"),
      DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.subtitle
    ),
    showCounts: booleanValue(
      optionValue(raw, legacyOptions, "showCounts"),
      DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.showCounts
    ),
    showIcons: booleanValue(
      optionValue(raw, legacyOptions, "showIcons"),
      DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.showIcons
    ),
    palette: normalizePalette(optionValue(raw, legacyOptions, "palette")),
    textSize: clamp(
      finiteNumber(
        optionValue(raw, legacyOptions, "textSize", "fontSize"),
        DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.textSize
      ),
      8,
      72
    ),
    maximizeLabelText: booleanValue(
      optionValue(raw, legacyOptions, "maximizeLabelText", "maximizeText"),
      DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.maximizeLabelText
    ),
    density: normalizeDensity(optionValue(raw, legacyOptions, "density", "spacingDensity")),
    flowerPetalsPerLayer: normalizeFlowerPetalsPerLayer(
      optionValue(raw, legacyOptions, "flowerPetalsPerLayer", "petalsPerLayer")
    ),
    flowerLayerCount: flowerLayerCountValue === undefined
      ? DEFAULT_RELATIONSHIP_DIAGRAM_SPEC.flowerLayerCount
      : normalizeFlowerLayerCount(flowerLayerCountValue),
    decorativeLevel: normalizeDecorativeLevel(
      optionValue(raw, legacyOptions, "decorativeLevel", "decoration")
    ),
    background: normalizeBackground(
      optionValue(raw, legacyOptions, "background", "backgroundColor")
    ),
    sortSources: normalizeSourceSort(
      optionValue(raw, legacyOptions, "sortSources", "sourceSort")
    ),
    sortTargets: normalizeTargetSort(
      optionValue(raw, legacyOptions, "sortTargets", "targetSort")
    ),
    ...(itemOrder.length ? { itemOrder } : {}),
    ...(itemStyles ? { itemStyles } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontWeight ? { fontWeight } : {}),
    ...(fontStyle ? { fontStyle } : {}),
    ...(textColor ? { textColor } : {}),
    ...(borderColor ? { borderColor } : {}),
    ...(borderWidthValue !== undefined
      ? { borderWidth: clamp(finiteNumber(borderWidthValue, 2), 0, 16) }
      : {}),
    ...(fillOpacityValue !== undefined
      ? { fillOpacity: clamp(finiteNumber(fillOpacityValue, 1), 0, 1) }
      : {}),
    ...(centerFillColor ? { centerFillColor } : {}),
    ...(centerBorderColor ? { centerBorderColor } : {}),
    ...(centerTextColor ? { centerTextColor } : {}),
    ...(centerBorderWidthValue !== undefined
      ? { centerBorderWidth: clamp(finiteNumber(centerBorderWidthValue, 4), 0, 16) }
      : {}),
  };
}

export function migrateRelationshipDiagramSpec(
  value: unknown,
  fallbackScope: Partial<RelationshipDiagramScope> = {}
): RelationshipDiagramSpec {
  return normalizeRelationshipDiagramSpec(value, fallbackScope);
}

export function createRelationshipDiagramSpec(
  scope: RelationshipDiagramScope,
  overrides: Partial<Omit<RelationshipDiagramSpec, "scope" | "version">> = {}
): RelationshipDiagramSpec {
  return normalizeRelationshipDiagramSpec({
    ...overrides,
    scope,
    version: RELATIONSHIP_DIAGRAM_SPEC_VERSION,
  }, scope);
}

/** Expands branch scope in hierarchy order and keeps all other scopes stable. */
export function expandRelationshipDiagramScope(
  scope: RelationshipDiagramScope,
  hierarchy?: Hierarchy,
  availableNodeIds?: ReadonlySet<string>
): string[] {
  const normalized = normalizeRelationshipDiagramScope(scope);
  let sourceNodeIds: string[];
  if (normalized.mode === "selected-branch") {
    const branchRootNodeIds = normalized.branchRootNodeIds?.length
      ? normalized.branchRootNodeIds
      : normalized.sourceNodeIds;
    sourceNodeIds = branchRootNodeIds.flatMap((branchRootNodeId) =>
      hierarchy ? getSubtree(branchRootNodeId, hierarchy) : [branchRootNodeId]
    );
  } else if (normalized.mode === "selected-node") {
    sourceNodeIds = normalized.sourceNodeIds.slice(0, 1);
  } else {
    sourceNodeIds = normalized.sourceNodeIds;
  }

  const seen = new Set<string>();
  return sourceNodeIds.filter((nodeId) => {
    if (seen.has(nodeId) || (availableNodeIds && !availableNodeIds.has(nodeId))) return false;
    seen.add(nodeId);
    return true;
  });
}

function nodeStringData(node: Node, fields: readonly string[]): string | undefined {
  const data = (node.data ?? {}) as UnknownRecord;
  for (const field of fields) {
    const value = nonEmptyString(data[field]);
    if (value) return value;
  }
  return undefined;
}

function nodeColor(node: Node): string | undefined {
  return nodeStringData(node, [
    "radialFillColor",
    "fillColor",
    "color",
    "backgroundColor",
    "background",
  ]);
}

function nodeIcon(node: Node): string | undefined {
  return nodeStringData(node, ["icon", "iconName", "emoji"]);
}

function displayLabel(node: Node): string {
  return nodeDisplayLabel(node) || "Untitled";
}

function orderRank(nodeIds: readonly string[] | undefined): Map<string, number> | null {
  if (!nodeIds) return null;
  const rank = new Map<string, number>();
  nodeIds.forEach((nodeId, index) => {
    if (!rank.has(nodeId)) rank.set(nodeId, index);
  });
  return rank;
}

const labelCollator = new Intl.Collator("und", {
  numeric: true,
  sensitivity: "base",
});

export function buildRelationshipGroups({
  nodes,
  relationships,
  sourceNodeIds,
  targetNodeIds,
  relationTypes,
  sortSources = "natural",
  sortTargets = "natural",
}: BuildRelationshipGroupsOptions): RelationshipGroup[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const sourceRank = orderRank(sourceNodeIds);
  const targetRank = orderRank(targetNodeIds);
  const allowedSources = sourceNodeIds === undefined ? null : new Set(sourceNodeIds);
  const normalizedRelationTypes = canonicalRelationshipTypes(relationTypes ?? []);
  const allowedRelationTypes = normalizedRelationTypes.length
    ? new Set(normalizedRelationTypes)
    : null;

  type TargetAccumulator = {
    node: Node;
    firstRelationshipIndex: number;
  };
  type GroupAccumulator = {
    sourceNode: Node;
    firstRelationshipIndex: number;
    targets: Map<string, TargetAccumulator>;
  };
  const groupsBySource = new Map<string, GroupAccumulator>();

  relationships.forEach((relationship, relationshipIndex) => {
    const relationType = canonicalRelationshipType(relationship.relationType);
    if (!relationType || (allowedRelationTypes && !allowedRelationTypes.has(relationType))) return;
    if (allowedSources && !allowedSources.has(relationship.sourceNodeId)) return;
    if (relationship.sourceNodeId === relationship.targetNodeId) return;
    const sourceNode = nodesById.get(relationship.sourceNodeId);
    const targetNode = nodesById.get(relationship.targetNodeId);
    if (!sourceNode || !targetNode) return;

    let group = groupsBySource.get(relationship.sourceNodeId);
    if (!group) {
      group = {
        sourceNode,
        firstRelationshipIndex: relationshipIndex,
        targets: new Map<string, TargetAccumulator>(),
      };
      groupsBySource.set(relationship.sourceNodeId, group);
    }
    if (!group.targets.has(relationship.targetNodeId)) {
      group.targets.set(relationship.targetNodeId, {
        node: targetNode,
        firstRelationshipIndex: relationshipIndex,
      });
    }
  });

  const naturalSourceOrder = (first: GroupAccumulator, second: GroupAccumulator): number => {
    const firstRank = sourceRank?.get(first.sourceNode.id) ?? Number.MAX_SAFE_INTEGER;
    const secondRank = sourceRank?.get(second.sourceNode.id) ?? Number.MAX_SAFE_INTEGER;
    return firstRank - secondRank
      || first.firstRelationshipIndex - second.firstRelationshipIndex
      || first.sourceNode.id.localeCompare(second.sourceNode.id);
  };

  const groups = Array.from(groupsBySource.values());
  groups.sort((first, second) => {
    const natural = naturalSourceOrder(first, second);
    if (sortSources === "natural") return natural;
    if (sortSources === "count-asc") return first.targets.size - second.targets.size || natural;
    if (sortSources === "count-desc") return second.targets.size - first.targets.size || natural;
    const labelOrder = labelCollator.compare(displayLabel(first.sourceNode), displayLabel(second.sourceNode));
    return (sortSources === "label-desc" ? -labelOrder : labelOrder) || natural;
  });

  return groups.map((group) => {
    const naturalTargetOrder = (first: TargetAccumulator, second: TargetAccumulator): number => {
      const firstRank = targetRank?.get(first.node.id) ?? Number.MAX_SAFE_INTEGER;
      const secondRank = targetRank?.get(second.node.id) ?? Number.MAX_SAFE_INTEGER;
      return firstRank - secondRank
        || first.firstRelationshipIndex - second.firstRelationshipIndex
        || first.node.id.localeCompare(second.node.id);
    };
    const targets = Array.from(group.targets.values());
    targets.sort((first, second) => {
      const natural = naturalTargetOrder(first, second);
      if (sortTargets === "natural") return natural;
      const labelOrder = labelCollator.compare(displayLabel(first.node), displayLabel(second.node));
      return (sortTargets === "label-desc" ? -labelOrder : labelOrder) || natural;
    });

    const normalizedTargets: RelationshipGroupTarget[] = targets.map(({ node }) => {
      const color = nodeColor(node);
      return {
        id: node.id,
        label: displayLabel(node),
        ...(color ? { color } : {}),
      };
    });
    const sourceColor = nodeColor(group.sourceNode);
    const sourceIcon = nodeIcon(group.sourceNode);
    return {
      itemId: group.sourceNode.id,
      sourceNodeId: group.sourceNode.id,
      sourceLabel: displayLabel(group.sourceNode),
      ...(sourceColor ? { sourceColor } : {}),
      ...(sourceIcon ? { sourceIcon } : {}),
      targets: normalizedTargets,
      count: normalizedTargets.length,
    };
  });
}

export function buildRelationshipGroupsForSpec({
  spec,
  nodes,
  relationships,
  hierarchy,
  targetNodeIds,
}: BuildRelationshipGroupsForSpecOptions): RelationshipGroup[] {
  const availableNodeIds = new Set(nodes.map((node) => node.id));
  const sourceNodeIds = expandRelationshipDiagramScope(
    spec.scope,
    hierarchy,
    availableNodeIds
  );
  const groups = buildRelationshipGroups({
    nodes,
    relationships,
    sourceNodeIds,
    targetNodeIds,
    relationTypes: spec.relationTypes,
    sortSources: spec.sortSources,
    sortTargets: spec.sortTargets,
  });
  const diagramItems = sourceNodeIds.length === 1 && spec.layout !== "matrix"
    ? splitSingleSourceRelationshipItems(groups)
    : groups;
  const manualRank = orderRank(spec.itemOrder);
  if (!manualRank) return diagramItems;
  return diagramItems
    .map((group, index) => ({ group, index }))
    .sort((first, second) => {
      const firstRank = manualRank.get(first.group.itemId)
        ?? manualRank.get(first.group.sourceNodeId)
        ?? Number.MAX_SAFE_INTEGER;
      const secondRank = manualRank.get(second.group.itemId)
        ?? manualRank.get(second.group.sourceNodeId)
        ?? Number.MAX_SAFE_INTEGER;
      return firstRank - secondRank || first.index - second.index;
    })
    .map(({ group }) => group);
}
