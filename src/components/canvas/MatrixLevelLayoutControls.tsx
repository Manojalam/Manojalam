"use client";

import { useCanvasStore } from "@/store/canvas-store";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import { matrixLevelDepths, matrixLevelLayouts } from "@/lib/layout/matrix-level-layout";
import type { MatrixLevelLayout } from "@/lib/types";

export function MatrixLevelLayoutControls({ rootId }: { rootId: string }) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const root = nodes.find((node) => node.id === rootId);
  const rules = matrixLevelLayouts(root?.data.matrixLevelLayouts);
  const depths = matrixLevelDepths(rootId, buildHierarchy(nodes, edges));
  const lastDepth = Math.max(2, ...depths.values());
  const levels = ["all", ...new Set([
    ...Array.from({ length: lastDepth + 1 }, (_, index) => String(index)),
    ...Object.keys(rules).filter((key) => key !== "all"),
  ].sort((a, b) => Number(a) - Number(b)))];
  const label = (key: string) => key === "all" ? "All levels"
    : ["Root", "Children", "Grandchildren", "Great-grandchildren"][Number(key)] ?? `Level ${Number(key) + 1}`;
  const update = (key: string, field: keyof MatrixLevelLayout, value: string) => {
    const state = useCanvasStore.getState();
    const current = matrixLevelLayouts(state.nodes.find((node) => node.id === rootId)?.data.matrixLevelLayouts);
    state.pushHistory();
    state.updateNodeData(rootId, { matrixLevelLayouts: {
      ...current, [key]: { ...current[key], [field]: value === "auto" ? undefined : value },
    } });
  };
  const hasOverrides = nodes.some((node) => depths.has(node.id)
    && (node.data.matrixOrientation != null || node.data.matrixChildFlow != null));
  return (
    <div className="mb-2 space-y-2 rounded-md border border-border/70 bg-muted/35 p-2">
      <p className="text-[10px] font-medium">Layout by level</p>
      <p className="text-[9px] leading-snug text-muted-foreground">
        Each level controls where its children sit and whether they form a row or column.
        All levels sets the default; per-level and individual cell settings override it. New cells follow these rules.
      </p>
      <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-1 text-[9px]">
        <span>Parent level</span><span>Children sit</span><span>Arrange children</span>
        {levels.map((key) => (
          <div key={key} className="contents">
            <span className="font-medium">{label(key)}</span>
            <select aria-label={`${label(key)} child direction`}
              className="min-w-0 rounded border border-border bg-background p-1"
              value={rules[key]?.orientation ?? "auto"}
              onChange={(event) => update(key, "orientation", event.target.value)}>
              <option value="auto">{key === "all" ? "Auto" : "Default"}</option>
              <option value="horizontal">Right</option><option value="vertical">Below</option>
            </select>
            <select aria-label={`${label(key)} child arrangement`}
              className="min-w-0 rounded border border-border bg-background p-1"
              value={rules[key]?.childFlow ?? "auto"}
              onChange={(event) => update(key, "childFlow", event.target.value)}>
              <option value="auto">{key === "all" ? "Auto" : "Default"}</option>
              <option value="row">Row</option><option value="column">Column</option>
            </select>
          </div>
        ))}
      </div>
      <button type="button" disabled={!hasOverrides}
        className="w-full rounded border border-border bg-background p-1 text-[9px] disabled:opacity-50"
        onClick={() => {
          const state = useCanvasStore.getState();
          state.pushHistory();
          useCanvasStore.setState({ nodes: state.nodes.map((node) => depths.has(node.id)
            ? { ...node, data: { ...node.data, matrixOrientation: undefined, matrixChildFlow: undefined } }
            : node), saveStatus: "unsaved" });
          state.scheduleMatrixReflow(rootId);
        }}>
        Use defaults for every cell
      </button>
    </div>
  );
}
