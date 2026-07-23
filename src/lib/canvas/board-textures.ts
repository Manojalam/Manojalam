import type { BoardTexture } from "../types";

export interface BoardTextureStyle {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
}

export const BOARD_TEXTURE_PRESETS: ReadonlyArray<{
  id: BoardTexture;
  label: string;
  description: string;
}> = [
  { id: "none", label: "None", description: "Solid canvas color" },
  { id: "paper", label: "Paper", description: "Fine natural fibers" },
  { id: "linen", label: "Linen", description: "Soft woven crosshatch" },
  { id: "grain", label: "Grain", description: "Subtle scattered speckles" },
];

export function normalizeBoardTexture(value: unknown): BoardTexture {
  return value === "paper" || value === "linen" || value === "grain" ? value : "none";
}

/** CSS-only patterns remain sharp at every zoom and require no external image assets. */
export function boardTextureStyle(value: unknown): BoardTextureStyle {
  const texture = normalizeBoardTexture(value);
  if (texture === "paper") {
    return {
      backgroundImage: [
        "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.055) 0 0.7px, transparent 0.9px)",
        "radial-gradient(circle at 75% 65%, rgba(0,0,0,0.055) 0 0.65px, transparent 0.9px)",
      ].join(","),
      backgroundSize: "5px 5px, 7px 7px",
      backgroundPosition: "0 0, 2px 3px",
    };
  }
  if (texture === "linen") {
    return {
      backgroundImage: [
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.032) 0 1px, transparent 1px 4px)",
        "repeating-linear-gradient(90deg, rgba(0,0,0,0.045) 0 1px, transparent 1px 5px)",
      ].join(","),
      backgroundSize: "auto",
      backgroundPosition: "0 0",
    };
  }
  if (texture === "grain") {
    return {
      backgroundImage: [
        "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.07) 0 0.75px, transparent 1px)",
        "radial-gradient(circle at 70% 60%, rgba(0,0,0,0.07) 0 0.7px, transparent 1px)",
        "radial-gradient(circle at 45% 85%, rgba(255,255,255,0.04) 0 0.55px, transparent 0.8px)",
      ].join(","),
      backgroundSize: "9px 9px, 11px 11px, 13px 13px",
      backgroundPosition: "0 0, 3px 4px, 7px 2px",
    };
  }
  return {};
}
