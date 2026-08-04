import type { LayoutMode } from "../types";

export type ImportLayoutMode =
  | Extract<LayoutMode, "horizontal" | "vertical" | "list" | "radial" | "matrix">
  | "cards";

export interface ImportLayoutOption {
  mode: ImportLayoutMode;
  label: string;
  description: string;
}

export const IMPORT_LAYOUT_OPTIONS = [
  { mode: "horizontal", label: "Horizontal", description: "Tree grows left to right" },
  { mode: "vertical", label: "Vertical", description: "Balanced tree fanning down" },
  { mode: "list", label: "List", description: "Indented editable outline" },
  { mode: "cards", label: "Cards", description: "Independent editable shapes in a compact grid" },
  { mode: "radial", label: "Sunburst", description: "Concentric hierarchy rendered as filled sectors" },
  { mode: "matrix", label: "Matrix", description: "Structured chart or table" },
] as const satisfies readonly ImportLayoutOption[];

const IMPORT_LAYOUT_MODES = new Set<ImportLayoutMode>(
  IMPORT_LAYOUT_OPTIONS.map((option) => option.mode)
);

export function isImportLayoutMode(value: unknown): value is ImportLayoutMode {
  return typeof value === "string" && IMPORT_LAYOUT_MODES.has(value as ImportLayoutMode);
}

export function isStructuredImportLayoutMode(
  value: ImportLayoutMode
): value is Exclude<ImportLayoutMode, "cards"> {
  return value !== "cards";
}
