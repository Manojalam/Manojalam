import type { Node } from "@xyflow/react";

import {
  getSubtree,
  isDescendant,
  type Hierarchy,
} from "@/lib/layout/hierarchy";
import type { NodeRelationship } from "@/lib/types";

export type { NodeRelationship } from "@/lib/types";

export interface RelationshipTypeDefinition {
  relationType: string;
  label: string;
  sourceBranchLabels: readonly string[];
  targetBranchLabels: readonly string[];
  includeTargetBranchRoot?: boolean;
}

export const DEFAULT_RELATIONSHIP_TYPE = "related-to";
export const LEGACY_RELATIONSHIP_TYPE = "has-guna";

export type RelationshipPolicyFailure =
  | "unknown-relation-type"
  | "missing-chart-root"
  | "missing-source"
  | "source-outside-chart"
  | "source-not-eligible"
  | "target-branch-not-found";

export interface RelationshipPolicyResolution {
  definition: RelationshipTypeDefinition | null;
  sourceNodeId: string;
  chartRootId: string;
  sourceBranchNodeId: string | null;
  targetBranchNodeId: string | null;
  validTargetIds: string[];
  validTargetIdSet: ReadonlySet<string>;
  ok: boolean;
  failure?: RelationshipPolicyFailure;
}

export interface ResolveRelationshipPolicyOptions {
  relationType: string;
  sourceNodeId: string;
  chartRootId: string;
  nodes: readonly Node[];
  hierarchy: Hierarchy;
  /**
   * A previously resolved branch id wins over label bootstrapping when it is
   * still inside the current chart. Persisting this id makes policies stable
   * when users rename branch labels.
   */
  targetBranchNodeId?: string | null;
}

export const RELATIONSHIP_TYPE_DEFINITIONS: Readonly<Record<string, RelationshipTypeDefinition>> = {
  [DEFAULT_RELATIONSHIP_TYPE]: {
    relationType: DEFAULT_RELATIONSHIP_TYPE,
    label: "Related to",
    // Empty branch constraints mean every node in the current radial chart
    // can be a source and every other node can be a target.
    sourceBranchLabels: [],
    targetBranchLabels: [],
    includeTargetBranchRoot: true,
  },
  [LEGACY_RELATIONSHIP_TYPE]: {
    relationType: LEGACY_RELATIONSHIP_TYPE,
    label: "Has guṇa",
    // Existing records keep their semantic type, but selection is no longer
    // coupled to Sanskrit labels or to one particular chart template.
    sourceBranchLabels: [],
    targetBranchLabels: [],
    includeTargetBranchRoot: true,
  },
};

/** Normalize storage/action input without changing semantic relationship ids. */
export function canonicalRelationshipType(relationType: string): string {
  return relationType.trim();
}

const LABEL_FIELDS = [
  "text",
  "title",
  "topic",
  "label",
  "devanagari",
  "iast",
  "translation",
  "rule",
] as const;

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] !== "#") return named[token.toLowerCase()] ?? entity;
    const hexadecimal = token[1]?.toLowerCase() === "x";
    const numeric = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(numeric);
    } catch {
      return entity;
    }
  });
}

function stripRichText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** Returns the same human-readable content used by hierarchy-driven charts. */
export function nodeDisplayLabel(node: Node | undefined): string {
  if (!node) return "";
  const data = (node.data ?? {}) as Record<string, unknown>;
  const richText = stripRichText(data.richText);
  if (richText) return richText;

  return LABEL_FIELDS
    .map((field) => data[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Produces a comparison key without splitting or stripping Indic combining
 * marks. Join controls are ignored only for matching so equivalent conjunct
 * spellings can resolve the same semantic branch.
 */
export function normalizeRelationshipLabel(value: string): string {
  return decodeHtmlEntities(value)
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("sa");
}

export function relationshipIdentity(
  relationship: Pick<NodeRelationship, "sourceNodeId" | "targetNodeId" | "relationType">
): string {
  return `${canonicalRelationshipType(relationship.relationType)}\u0000${relationship.sourceNodeId}\u0000${relationship.targetNodeId}`;
}

export function deduplicateRelationships(relationships: readonly NodeRelationship[]): NodeRelationship[] {
  const seen = new Set<string>();
  const result: NodeRelationship[] = [];
  for (const relationship of relationships) {
    const identity = relationshipIdentity(relationship);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(relationship);
  }
  return result;
}

/** Depth-first chart order. `Hierarchy.childIds` already honors childOrder. */
export function orderedHierarchyNodeIds(
  chartRootId: string,
  hierarchy: Hierarchy,
  includeRoot = true
): string[] {
  const ordered = getSubtree(chartRootId, hierarchy);
  return includeRoot ? ordered : ordered.filter((nodeId) => nodeId !== chartRootId);
}

export function orderNodeIdsByHierarchy(
  nodeIds: Iterable<string>,
  chartRootId: string,
  hierarchy: Hierarchy
): string[] {
  const requested = new Set(nodeIds);
  const result = orderedHierarchyNodeIds(chartRootId, hierarchy)
    .filter((nodeId) => requested.delete(nodeId));
  // Stale or cross-chart ids are kept deterministic without preserving click order.
  return [...result, ...Array.from(requested).sort((first, second) => first.localeCompare(second))];
}

export function orderRelationshipsByChart(
  relationships: readonly NodeRelationship[],
  chartRootId: string,
  hierarchy: Hierarchy
): NodeRelationship[] {
  const chartOrder = new Map(
    orderedHierarchyNodeIds(chartRootId, hierarchy).map((nodeId, index) => [nodeId, index])
  );
  return relationships
    .map((relationship, originalIndex) => ({ relationship, originalIndex }))
    .sort((first, second) => {
      const firstOrder = chartOrder.get(first.relationship.targetNodeId) ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = chartOrder.get(second.relationship.targetNodeId) ?? Number.MAX_SAFE_INTEGER;
      return firstOrder - secondOrder
        || first.relationship.targetNodeId.localeCompare(second.relationship.targetNodeId)
        || first.originalIndex - second.originalIndex;
    })
    .map(({ relationship }) => relationship);
}

export function relationshipDefinition(relationType: string): RelationshipTypeDefinition | null {
  const canonical = canonicalRelationshipType(relationType);
  if (!canonical) return null;
  return RELATIONSHIP_TYPE_DEFINITIONS[canonical] ?? {
    relationType: canonical,
    label: canonical,
    sourceBranchLabels: [],
    targetBranchLabels: [],
    includeTargetBranchRoot: true,
  };
}

function emptyResolution(
  options: ResolveRelationshipPolicyOptions,
  definition: RelationshipTypeDefinition | null,
  failure: RelationshipPolicyFailure,
  sourceBranchNodeId: string | null = null,
  targetBranchNodeId: string | null = null
): RelationshipPolicyResolution {
  return {
    definition,
    sourceNodeId: options.sourceNodeId,
    chartRootId: options.chartRootId,
    sourceBranchNodeId,
    targetBranchNodeId,
    validTargetIds: [],
    validTargetIdSet: new Set<string>(),
    ok: false,
    failure,
  };
}

function nearestMatchingAncestor(
  nodeId: string,
  chartRootId: string,
  hierarchy: Hierarchy,
  byId: ReadonlyMap<string, Node>,
  matchingLabels: ReadonlySet<string>
): string | null {
  const visited = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (matchingLabels.has(normalizeRelationshipLabel(nodeDisplayLabel(byId.get(currentId))))) {
      return currentId;
    }
    if (currentId === chartRootId) break;
    currentId = hierarchy.get(currentId)?.parentId ?? null;
  }
  return null;
}

export function resolveRelationshipPolicy(
  options: ResolveRelationshipPolicyOptions
): RelationshipPolicyResolution {
  const definition = relationshipDefinition(options.relationType);
  if (!definition) return emptyResolution(options, null, "unknown-relation-type");

  const byId = new Map(options.nodes.map((node) => [node.id, node]));
  if (!byId.has(options.chartRootId) || !options.hierarchy.has(options.chartRootId)) {
    return emptyResolution(options, definition, "missing-chart-root");
  }
  if (!byId.has(options.sourceNodeId) || !options.hierarchy.has(options.sourceNodeId)) {
    return emptyResolution(options, definition, "missing-source");
  }
  if (!isDescendant(options.chartRootId, options.sourceNodeId, options.hierarchy)) {
    return emptyResolution(options, definition, "source-outside-chart");
  }

  const sourceLabelKeys = new Set(definition.sourceBranchLabels.map(normalizeRelationshipLabel));
  const sourceBranchNodeId = definition.sourceBranchLabels.length
    ? nearestMatchingAncestor(
        options.sourceNodeId,
        options.chartRootId,
        options.hierarchy,
        byId,
        sourceLabelKeys
      )
    : options.chartRootId;
  if (!sourceBranchNodeId) {
    return emptyResolution(options, definition, "source-not-eligible");
  }

  const targetBranchNodeId = definition.targetBranchLabels.length === 0
    ? options.chartRootId
    : (() => {
        const persistedTargetId = options.targetBranchNodeId;
        const persistedTargetIsUsable = !!persistedTargetId
          && byId.has(persistedTargetId)
          && isDescendant(options.chartRootId, persistedTargetId, options.hierarchy);
        if (persistedTargetIsUsable) return persistedTargetId;
        const targetLabelKeys = new Set(definition.targetBranchLabels.map(normalizeRelationshipLabel));
        return orderedHierarchyNodeIds(options.chartRootId, options.hierarchy)
          .find((nodeId) => targetLabelKeys.has(
            normalizeRelationshipLabel(nodeDisplayLabel(byId.get(nodeId)))
          )) ?? null;
      })();

  if (!targetBranchNodeId) {
    return emptyResolution(
      options,
      definition,
      "target-branch-not-found",
      sourceBranchNodeId
    );
  }

  const validTargetIds = orderedHierarchyNodeIds(targetBranchNodeId, options.hierarchy)
    .filter((nodeId) => byId.has(nodeId))
    .filter((nodeId) => definition.includeTargetBranchRoot || nodeId !== targetBranchNodeId)
    .filter((nodeId) => nodeId !== options.sourceNodeId);

  return {
    definition,
    sourceNodeId: options.sourceNodeId,
    chartRootId: options.chartRootId,
    sourceBranchNodeId,
    targetBranchNodeId,
    validTargetIds,
    validTargetIdSet: new Set(validTargetIds),
    ok: true,
  };
}
