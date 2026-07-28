import { generateId } from "../utils";
import { normalizeImportedText, scriptModeForText } from "./script";
import type {
  GeometryTextLine,
  HierarchyDraft,
  HierarchyDraftNode,
  HierarchySourceReference,
} from "./types";

export interface RawHierarchyNode {
  text: string;
  children: RawHierarchyNode[];
  confidence: number;
  source?: HierarchySourceReference;
}

export function createDraftNode(
  label: string,
  options: Partial<Omit<HierarchyDraftNode, "id" | "label" | "children" | "scriptMode">> & {
    children?: HierarchyDraftNode[];
  } = {}
): HierarchyDraftNode {
  const normalizedLabel = normalizeImportedText(label) || "Untitled";
  const notes = normalizeImportedText(options.notes ?? "");
  return {
    id: generateId(),
    label: normalizedLabel,
    notes,
    children: options.children ?? [],
    confidence: options.confidence ?? 1,
    scriptMode: scriptModeForText(`${normalizedLabel}\n${notes}`),
    source: options.source,
    warnings: options.warnings,
  };
}

function punctuationCount(value: string): number {
  return (value.match(/[।॥.!?]/gu) ?? []).length;
}

export function isLikelyStructuralLabel(value: string): boolean {
  const text = normalizeImportedText(value);
  if (!text) return false;
  if (/^(?:[\p{N}]+\s+)?(?:अक्षराणि|letters?)(?:\s|[।.]|$)/iu.test(text)) return true;
  if (text.endsWith("...") && text.length <= 40) return true;
  if (punctuationCount(text) > 0) return false;
  const words = text.split(/\s+/u).filter(Boolean).length;
  if (text.length <= 64 && words <= 8) return true;
  return false;
}

function rawText(node: RawHierarchyNode): string {
  return [node.text, ...node.children.map(rawText)]
    .map(normalizeImportedText)
    .filter(Boolean)
    .join("\n");
}

function compactChildren(
  rawChildren: RawHierarchyNode[],
  parent: HierarchyDraftNode
): void {
  for (const raw of rawChildren) {
    if (isLikelyStructuralLabel(raw.text)) {
      const child = createDraftNode(raw.text, {
        confidence: raw.confidence,
        source: raw.source,
        warnings: raw.confidence < 0.75 ? ["Low-confidence text; please review."] : undefined,
      });
      compactChildren(raw.children, child);
      parent.children.push(child);
      continue;
    }

    const detail = rawText(raw);
    parent.notes = normalizeImportedText(
      [parent.notes, detail].filter(Boolean).join("\n")
    );
    parent.scriptMode = scriptModeForText(`${parent.label}\n${parent.notes}`);

    // Preserve any clearly structural descendants rather than hiding them in notes.
    for (const descendant of raw.children) {
      if (!isLikelyStructuralLabel(descendant.text)) continue;
      const promoted = createDraftNode(descendant.text, {
        confidence: descendant.confidence,
        source: descendant.source,
        warnings: ["Promoted from beneath descriptive text; verify its parent."],
      });
      compactChildren(descendant.children, promoted);
      parent.children.push(promoted);
    }
  }
}

function mergeNodes(target: HierarchyDraftNode, source: HierarchyDraftNode): void {
  target.notes = normalizeImportedText(
    [target.notes, source.notes].filter(Boolean).join("\n")
  );
  target.children.push(...source.children);
  target.confidence = Math.min(target.confidence, source.confidence);
  target.scriptMode = scriptModeForText(`${target.label}\n${target.notes}`);
}

export function mergeRepeatedRoots(roots: HierarchyDraftNode[]): HierarchyDraftNode[] {
  const merged: HierarchyDraftNode[] = [];
  const byLabel = new Map<string, HierarchyDraftNode>();
  for (const root of roots) {
    const key = normalizeImportedText(root.label).toLocaleLowerCase();
    const existing = byLabel.get(key);
    if (existing) {
      mergeNodes(existing, root);
    } else {
      merged.push(root);
      byLabel.set(key, root);
    }
  }
  return merged;
}

export function ensureSingleDraftRoot(
  draft: HierarchyDraft,
  preferredLabel: string
): HierarchyDraft {
  if (draft.roots.length === 1) return draft;
  const normalizedPreferred = normalizeImportedText(preferredLabel);
  const existingRoot = draft.roots.find(
    (root) =>
      normalizeImportedText(root.label).toLocaleLowerCase() ===
      normalizedPreferred.toLocaleLowerCase()
  );
  const warning = "Multiple possible roots were combined; verify the document root.";

  if (existingRoot) {
    existingRoot.children.push(
      ...draft.roots.filter((root) => root.id !== existingRoot.id)
    );
    existingRoot.warnings = [
      ...(existingRoot.warnings ?? []),
      "Additional top-level sections were attached beneath this document root.",
    ];
    return {
      ...draft,
      title: existingRoot.label,
      roots: [existingRoot],
      warnings: [...draft.warnings, warning],
    };
  }

  const syntheticRoot = createDraftNode(normalizedPreferred, {
    children: draft.roots,
    confidence: Math.min(...draft.roots.map((root) => root.confidence)),
    warnings: ["Multiple roots were combined under this editable document root."],
  });
  return {
    ...draft,
    title: syntheticRoot.label,
    roots: [syntheticRoot],
    warnings: [...draft.warnings, warning],
  };
}

export function compactRawHierarchy(rawRoots: RawHierarchyNode[]): HierarchyDraftNode[] {
  const roots = rawRoots.map((raw) => {
    const root = createDraftNode(raw.text, {
      confidence: raw.confidence,
      source: raw.source,
      warnings: raw.confidence < 0.75 ? ["Low-confidence text; please review."] : undefined,
    });
    compactChildren(raw.children, root);
    return root;
  });
  return mergeRepeatedRoots(roots);
}

function clusterIndentLevels(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const levels: number[] = [];
  for (const value of sorted) {
    const last = levels.at(-1);
    if (last === undefined || value - last > tolerance) {
      levels.push(value);
    } else {
      levels[levels.length - 1] = (last + value) / 2;
    }
  }
  return levels;
}

function nearestLevel(value: number, levels: number[]): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  levels.forEach((level, index) => {
    const nextDistance = Math.abs(level - value);
    if (nextDistance < distance) {
      best = index;
      distance = nextDistance;
    }
  });
  return best;
}

export function geometryLinesToRawHierarchy(
  lines: GeometryTextLine[]
): RawHierarchyNode[] {
  if (!lines.length) return [];
  const normalizedX = lines.map(
    (line) => (line.indentX ?? line.x) / Math.max(1, line.pageWidth)
  );
  const levels = clusterIndentLevels(normalizedX, 0.018);
  const roots: RawHierarchyNode[] = [];
  const stack: RawHierarchyNode[] = [];

  const ordered = [...lines].sort((a, b) =>
    a.page - b.page || a.y - b.y || a.x - b.x
  );
  for (const line of ordered) {
    const text = normalizeImportedText(line.text);
    if (!text) continue;
    const depth = nearestLevel(
      (line.indentX ?? line.x) / Math.max(1, line.pageWidth),
      levels
    );
    const node: RawHierarchyNode = {
      text,
      children: [],
      confidence: Math.max(0, Math.min(1, line.confidence)),
      source: {
        kind: line.page > 0 ? "pdf" : "image",
        page: Math.max(1, line.page),
        bbox: {
          x: line.x / Math.max(1, line.pageWidth),
          y: line.y / Math.max(1, line.pageHeight),
          width: line.width / Math.max(1, line.pageWidth),
          height: line.height / Math.max(1, line.pageHeight),
        },
      },
    };

    if (depth === 0 || !stack.length) {
      roots.push(node);
      stack.length = 0;
      stack.push(node);
      continue;
    }

    const safeDepth = Math.min(depth, stack.length);
    const parent = stack[safeDepth - 1] ?? stack[stack.length - 1];
    parent.children.push(node);
    stack.length = safeDepth;
    stack.push(node);
  }
  return roots;
}

export interface DraftNodeLocation {
  node: HierarchyDraftNode;
  parent: HierarchyDraftNode | null;
  siblings: HierarchyDraftNode[];
  index: number;
}

export function locateDraftNode(
  roots: HierarchyDraftNode[],
  nodeId: string,
  parent: HierarchyDraftNode | null = null
): DraftNodeLocation | null {
  for (let index = 0; index < roots.length; index += 1) {
    const node = roots[index];
    if (node.id === nodeId) return { node, parent, siblings: roots, index };
    const nested = locateDraftNode(node.children, nodeId, node);
    if (nested) return nested;
  }
  return null;
}

export function refreshDraftScripts(nodes: HierarchyDraftNode[]): void {
  nodes.forEach((node) => {
    node.label = normalizeImportedText(node.label) || "Untitled";
    node.notes = normalizeImportedText(node.notes);
    node.scriptMode = scriptModeForText(`${node.label}\n${node.notes}`);
    refreshDraftScripts(node.children);
  });
}
