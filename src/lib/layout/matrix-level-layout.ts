import type { Node } from "@xyflow/react";
import type { MatrixLevelLayout, MatrixLevelLayouts } from "../types";
import type { Hierarchy } from "./hierarchy";

export function matrixLevelLayouts(value: unknown): MatrixLevelLayouts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: MatrixLevelLayouts = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== "all" && (!/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key)))) continue;
    if (!entry || typeof entry !== "object") continue;
    const rule = entry as MatrixLevelLayout;
    result[key] = {
      ...(rule.orientation === "horizontal" || rule.orientation === "vertical" ? { orientation: rule.orientation } : {}),
      ...(rule.childFlow === "row" || rule.childFlow === "column" ? { childFlow: rule.childFlow } : {}),
    };
  }
  return result;
}

export function matrixLevelDepths(rootId: string, hierarchy: Hierarchy): Map<string, number> {
  const levels = new Map<string, number>();
  const visit = (id: string, depth: number) => {
    if (levels.has(id)) return;
    levels.set(id, depth);
    for (const child of hierarchy.get(id)?.childIds ?? []) visit(child, depth + 1);
  };
  visit(rootId, 0);
  return levels;
}

/** Defaults are resolved for layout only, never stored as per-cell overrides. */
export function withMatrixLevelDefaults(rootId: string, hierarchy: Hierarchy, byId: Map<string, Node>): Map<string, Node> {
  const rules = matrixLevelLayouts(byId.get(rootId)?.data.matrixLevelLayouts);
  if (!Object.keys(rules).length) return byId;
  const resolved = new Map(byId);
  for (const [id, depth] of matrixLevelDepths(rootId, hierarchy)) {
    const node = byId.get(id);
    if (!node) continue;
    const data = node.data;
    const orientation = data.matrixOrientation === "horizontal" || data.matrixOrientation === "vertical"
      ? data.matrixOrientation : rules[String(depth)]?.orientation ?? rules.all?.orientation;
    const childFlow = data.matrixChildFlow === "row" || data.matrixChildFlow === "column"
      ? data.matrixChildFlow : rules[String(depth)]?.childFlow ?? rules.all?.childFlow;
    resolved.set(id, { ...node, data: { ...data,
      ...(orientation ? { matrixOrientation: orientation } : {}),
      ...(childFlow ? { matrixChildFlow: childFlow } : {}),
    } });
  }
  return resolved;
}
