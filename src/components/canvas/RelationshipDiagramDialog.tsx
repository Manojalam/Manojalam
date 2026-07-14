"use client";

import { useMemo, useState, type ReactNode } from "react";
import { LayoutGrid, Network, Orbit, Rows3, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { relationshipDiagramDimensions } from "@/components/canvas/RelationshipDiagramSvg";
import { buildHierarchy } from "@/lib/layout/hierarchy";
import {
  buildRelationshipGroupsForSpec,
  createRelationshipDiagramSpec,
  expandRelationshipDiagramScope,
  isTransparentRelationshipDiagramBackground,
  normalizeRelationshipDiagramSpec,
} from "@/lib/relationship-diagram";
import type {
  RelationshipDiagramDecorativeLevel,
  RelationshipDiagramDensity,
  RelationshipDiagramLayout,
  RelationshipDiagramPalette,
  RelationshipDiagramScopeMode,
  RelationshipDiagramSourceSort,
  RelationshipDiagramSpec,
  RelationshipDiagramTargetSort,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore, type RelationshipDiagramRequest } from "@/store/ui-store";

const LAYOUT_OPTIONS: Array<{
  value: RelationshipDiagramLayout;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    value: "arc-fan",
    label: "Arc Fan",
    description: "Picture-2 style: each source owns a bounded outer target fan.",
    icon: Rows3,
  },
  {
    value: "flower",
    label: "Flower",
    description: "Sources become petals with their related items inside.",
    icon: Sparkles,
  },
  {
    value: "matrix",
    label: "Matrix",
    description: "Compact source-by-target comparison for dense data.",
    icon: LayoutGrid,
  },
  {
    value: "card-grid",
    label: "Card Grid",
    description: "Readable source cards with target lists.",
    icon: Rows3,
  },
  {
    value: "radial-hub",
    label: "Radial Hub",
    description: "One central hub with self-contained source groups.",
    icon: Orbit,
  },
];

function relationshipDiagramDraft(
  request: ReturnType<typeof useUIStore.getState>["relationshipDiagramRequest"],
  nodes: ReturnType<typeof useCanvasStore.getState>["nodes"],
  selectedNodeIds: string[]
): RelationshipDiagramSpec {
  if (request?.mode === "edit" && request.diagramNodeId) {
    const diagram = nodes.find((node) =>
      node.id === request.diagramNodeId && node.type === "relationshipDiagram"
    );
    if (diagram) {
      return normalizeRelationshipDiagramSpec(
        (diagram.data as Record<string, unknown>).relationshipDiagramSpec
      );
    }
  }
  const candidates = request?.sourceNodeIds?.length
    ? request.sourceNodeIds
    : selectedNodeIds;
  const sourceNodeIds = Array.from(new Set(candidates)).filter((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    return !!node && !["sunburst", "frame", "relationshipDiagram"].includes(node.type ?? "");
  });
  return createRelationshipDiagramSpec({
    mode: sourceNodeIds.length === 1 ? "selected-node" : "selected-nodes",
    sourceNodeIds,
    ...(request?.chartRootNodeId ? { chartRootNodeId: request.chartRootNodeId } : {}),
  }, {
    layout: "arc-fan",
    title: "Relationship Diagram",
  });
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

function RelationshipDiagramDialogOpen({ request }: { request: RelationshipDiagramRequest }) {
  const close = useUIStore((state) => state.closeRelationshipDiagram);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const relationships = useCanvasStore((state) => state.relationships);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const createDiagram = useCanvasStore((state) => state.createRelationshipDiagram);
  const updateDiagram = useCanvasStore((state) => state.updateRelationshipDiagramSpec);
  const [draft, setDraft] = useState<RelationshipDiagramSpec>(() =>
    relationshipDiagramDraft(request, nodes, selectedNodeIds)
  );
  const [relationshipFilter, setRelationshipFilter] = useState<"all" | "custom">(
    () => draft.relationTypes.length ? "custom" : "all"
  );
  const [availableSourceNodeIds] = useState(() => [...draft.scope.sourceNodeIds]);

  const contentNodes = useMemo(() => nodes.filter((node) =>
    !["sunburst", "frame", "relationshipDiagram"].includes(node.type ?? "")
  ), [nodes]);
  const hierarchy = useMemo(
    () => buildHierarchy(contentNodes, edges),
    [contentNodes, edges]
  );
  const scopedSourceIds = useMemo(
    () => expandRelationshipDiagramScope(draft.scope, hierarchy, new Set(contentNodes.map((node) => node.id))),
    [contentNodes, draft.scope, hierarchy]
  );
  const sourceSet = useMemo(() => new Set(scopedSourceIds), [scopedSourceIds]);
  const availableRelationTypes = useMemo(
    () => Array.from(new Set(
      relationships
        .filter((relationship) => sourceSet.has(relationship.sourceNodeId))
        .map((relationship) => relationship.relationType)
    )).sort((a, b) => a.localeCompare(b)),
    [relationships, sourceSet]
  );
  const availableRelationTypeSet = useMemo(
    () => new Set(availableRelationTypes),
    [availableRelationTypes]
  );
  const selectedAvailableRelationTypes = useMemo(
    () => draft.relationTypes.filter((relationType) => availableRelationTypeSet.has(relationType)),
    [availableRelationTypeSet, draft.relationTypes]
  );
  const unavailableSelectedRelationTypeCount = useMemo(
    () => draft.relationTypes.filter((relationType) => !availableRelationTypeSet.has(relationType)).length,
    [availableRelationTypeSet, draft.relationTypes]
  );
  const previewSpec = useMemo(
    () => relationshipFilter === "all"
      ? { ...draft, relationTypes: [] }
      : { ...draft, relationTypes: selectedAvailableRelationTypes },
    [draft, relationshipFilter, selectedAvailableRelationTypes]
  );
  const groups = useMemo(
    () => relationshipFilter === "custom" && !selectedAvailableRelationTypes.length
      ? []
      : buildRelationshipGroupsForSpec({
          spec: previewSpec,
          nodes: contentNodes,
          relationships,
          hierarchy,
        }),
    [contentNodes, hierarchy, previewSpec, relationshipFilter, relationships, selectedAvailableRelationTypes.length]
  );
  const transparentBackground = isTransparentRelationshipDiagramBackground(draft.background);

  const update = <Key extends keyof RelationshipDiagramSpec>(
    key: Key,
    value: RelationshipDiagramSpec[Key]
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const setScopeMode = (mode: RelationshipDiagramScopeMode) => {
    setDraft((current) => {
      const allIds = availableSourceNodeIds;
      const scopeWithoutBranchRoots: RelationshipDiagramSpec["scope"] = {
        ...current.scope,
      };
      delete scopeWithoutBranchRoots.branchRootNodeId;
      delete scopeWithoutBranchRoots.branchRootNodeIds;
      return {
        ...current,
        scope: {
          ...scopeWithoutBranchRoots,
          mode,
          sourceNodeIds: mode === "selected-node" ? allIds.slice(0, 1) : allIds,
          ...(mode === "selected-branch" && allIds.length
            ? { branchRootNodeIds: allIds }
            : {}),
        },
      };
    });
  };

  const toggleRelationType = (relationType: string) => {
    setDraft((current) => {
      const selected = new Set(current.relationTypes);
      if (selected.has(relationType)) selected.delete(relationType);
      else selected.add(relationType);
      return { ...current, relationTypes: Array.from(selected) };
    });
  };

  const submit = () => {
    const normalized = normalizeRelationshipDiagramSpec({
      ...draft,
      relationTypes: relationshipFilter === "all" ? [] : selectedAvailableRelationTypes,
    }, draft.scope);
    if (
      !normalized.scope.sourceNodeIds.length
      && !normalized.scope.branchRootNodeIds?.length
      && !normalized.scope.branchRootNodeId
    ) {
      toast.error("Select at least one source section.");
      return;
    }
    if (relationshipFilter === "custom" && !selectedAvailableRelationTypes.length) {
      toast.error("Choose a relationship type available in this scope, or use All types.");
      return;
    }
    const intrinsic = relationshipDiagramDimensions(groups, normalized);
    const frameSize = {
      width: Math.max(420, Math.ceil(intrinsic.width + 16)),
      height: Math.max(360, Math.ceil(intrinsic.height + 60)),
    };
    if (request?.mode === "edit" && request.diagramNodeId) {
      updateDiagram(request.diagramNodeId, normalized, frameSize);
      toast.success("Relationship diagram updated.");
      close();
      return;
    }
    const anchor = nodes.find((node) =>
      node.type === "sunburst"
      && (
        (node.data as Record<string, unknown>).rootId === request?.chartRootNodeId
        || (node.data as Record<string, unknown>).sunburstFor === request?.chartRootNodeId
      )
    );
    const createdId = createDiagram(normalized, anchor?.id, frameSize);
    if (!createdId) {
      toast.error("The relationship diagram could not be created.");
      return;
    }
    toast.success("Relationship diagram created beside the chart.");
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="h-[min(92dvh,920px)] max-h-[calc(100dvh-1rem)] w-[min(96vw,72rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>
            {request?.mode === "edit" ? "Relationship diagram options" : "Generate relationship diagram"}
          </DialogTitle>
          <DialogDescription>
            Creates a separate movable diagram. The original radial chart remains compact and unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 overflow-y-auto overscroll-contain touch-pan-y md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6 border-b p-6 md:border-b-0 md:border-r">
            <div className="space-y-3">
              <SectionTitle>Layout preset</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {LAYOUT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = draft.layout === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update("layout", option.value)}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:bg-muted/60"
                      )}
                    >
                      <span className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-xs font-semibold">{option.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle>Scope</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["selected-node", "First node"],
                  ["selected-nodes", "Selected nodes"],
                  ["selected-branch", "Whole branch"],
                ] as Array<[RelationshipDiagramScopeMode, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.scope.mode === value}
                    onClick={() => setScopeMode(value)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-[10px] font-medium",
                      draft.scope.mode === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {scopedSourceIds.length} source section{scopedSourceIds.length === 1 ? "" : "s"} in scope · {groups.length} with saved relationships
              </p>
            </div>

            <div className="space-y-3">
              <SectionTitle>Relationship types</SectionTitle>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={relationshipFilter === "all"}
                  onClick={() => setRelationshipFilter("all")}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[10px]",
                    relationshipFilter === "all" ? "border-primary bg-primary/10 text-primary" : "border-border"
                  )}
                >
                  All types
                </button>
                <button
                  type="button"
                  aria-pressed={relationshipFilter === "custom"}
                  onClick={() => setRelationshipFilter("custom")}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[10px]",
                    relationshipFilter === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border"
                  )}
                >
                  Choose types
                </button>
              </div>
              {relationshipFilter === "custom" && (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {availableRelationTypes.length ? availableRelationTypes.map((relationType) => (
                      <label key={relationType} className="flex items-center gap-2 text-[10px]">
                        <input
                          type="checkbox"
                          checked={draft.relationTypes.includes(relationType)}
                          onChange={() => toggleRelationType(relationType)}
                        />
                        <span className="truncate">{relationType}</span>
                      </label>
                    )) : (
                      <p className="col-span-2 text-[10px] text-muted-foreground">No saved relationship types in this scope.</p>
                    )}
                  </div>
                  {availableRelationTypes.length > 0 && !selectedAvailableRelationTypes.length && (
                    <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                      No chosen relationship types are available in this scope. Select one above or use All types.
                    </p>
                  )}
                  {unavailableSelectedRelationTypeCount > 0 && (
                    <p className="text-[9px] text-muted-foreground">
                      {unavailableSelectedRelationTypeCount} previously chosen type{unavailableSelectedRelationTypeCount === 1 ? " is" : "s are"} unavailable in this scope and will not be included.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="relationship-diagram-title" className="text-xs">Title</Label>
                <Input
                  id="relationship-diagram-title"
                  value={draft.title}
                  onChange={(event) => update("title", event.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relationship-diagram-subtitle" className="text-xs">Subtitle</Label>
                <Input
                  id="relationship-diagram-subtitle"
                  value={draft.subtitle}
                  onChange={(event) => update("subtitle", event.target.value)}
                  className="h-9 text-xs"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <SectionTitle>Appearance and ordering</SectionTitle>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs">Show counts</Label>
                  <p className="text-[9px] text-muted-foreground">Display target totals per source.</p>
                </div>
                <Switch
                  aria-label="Show relationship counts"
                  checked={draft.showCounts}
                  onCheckedChange={(value) => update("showCounts", value)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs">Markers</Label>
                  <p className="text-[9px] text-muted-foreground">Add compact target bullets where useful.</p>
                </div>
                <Switch
                  aria-label="Show target markers"
                  checked={draft.showIcons}
                  onCheckedChange={(value) => update("showIcons", value)}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="relationship-diagram-text-size" className="text-xs">Text size</Label>
                  <span className="text-[10px] text-muted-foreground">{draft.textSize}px</span>
                </div>
                <input
                  id="relationship-diagram-text-size"
                  type="range"
                  min="8"
                  max="36"
                  step="1"
                  value={draft.textSize}
                  onChange={(event) => update("textSize", Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Palette</Label>
                <Select value={draft.palette} onValueChange={(value) => update("palette", value as RelationshipDiagramPalette)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="source">Source colors</SelectItem>
                    <SelectItem value="spectrum">Spectrum</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cool">Cool</SelectItem>
                    <SelectItem value="pastel">Pastel</SelectItem>
                    <SelectItem value="monochrome">Monochrome</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Density</Label>
                  <Select value={draft.density} onValueChange={(value) => update("density", value as RelationshipDiagramDensity)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="spacious">Spacious</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Decoration</Label>
                  <Select value={draft.decorativeLevel} onValueChange={(value) => update("decorativeLevel", value as RelationshipDiagramDecorativeLevel)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="ornate">Ornate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="relationship-diagram-transparent-background" className="text-xs">
                      Transparent background
                    </Label>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Keep the canvas behind the diagram visible.
                    </p>
                  </div>
                  <Switch
                    id="relationship-diagram-transparent-background"
                    checked={transparentBackground}
                    onCheckedChange={(checked) => update(
                      "background",
                      checked ? "transparent" : "#ffffff"
                    )}
                  />
                </div>
                {!transparentBackground && <div className="flex gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(draft.background) ? draft.background : "#ffffff"}
                    onChange={(event) => update("background", event.target.value)}
                    className="h-9 w-11 rounded border bg-background p-1"
                    aria-label="Background color"
                  />
                  <Input
                    id="relationship-diagram-background"
                    value={draft.background}
                    onChange={(event) => update("background", event.target.value)}
                    className="h-9 text-xs"
                    aria-label="Background color value"
                  />
                </div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort sources</Label>
                  <Select value={draft.sortSources} onValueChange={(value) => update("sortSources", value as RelationshipDiagramSourceSort)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="natural">Chart order</SelectItem>
                      <SelectItem value="label-asc">Label A–Z</SelectItem>
                      <SelectItem value="label-desc">Label Z–A</SelectItem>
                      <SelectItem value="count-desc">Most targets</SelectItem>
                      <SelectItem value="count-asc">Fewest targets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort targets</Label>
                  <Select value={draft.sortTargets} onValueChange={(value) => update("sortTargets", value as RelationshipDiagramTargetSort)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="natural">Chart order</SelectItem>
                      <SelectItem value="label-asc">Label A–Z</SelectItem>
                      <SelectItem value="label-desc">Label Z–A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/35 p-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold">Live relationship data</p>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {groups.reduce((sum, group) => sum + group.count, 0)} saved link{groups.reduce((sum, group) => sum + group.count, 0) === 1 ? "" : "s"} across {groups.length} source group{groups.length === 1 ? "" : "s"}. Refreshing never duplicates chart nodes.
              </p>
            </div>
          </div>
        </div>

        <div className="z-10 flex shrink-0 flex-col gap-3 border-t bg-background px-6 py-4 shadow-[0_-8px_20px_-18px_rgba(15,23,42,0.6)] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] text-muted-foreground">
            The generated diagram is movable, resizable, and independently exportable.
          </p>
          <div className="flex justify-end gap-2">
            <Button className="max-sm:flex-1" variant="outline" onClick={close}>Cancel</Button>
            <Button className="max-sm:flex-1" onClick={submit}>
              {request?.mode === "edit" ? "Regenerate diagram" : "Generate diagram"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RelationshipDiagramDialog() {
  const request = useUIStore((state) => state.relationshipDiagramRequest);
  if (!request) return null;
  const requestKey = [
    request.mode,
    request.diagramNodeId ?? "",
    request.chartRootNodeId ?? "",
    ...(request.sourceNodeIds ?? []),
  ].join(":");
  return <RelationshipDiagramDialogOpen key={requestKey} request={request} />;
}
