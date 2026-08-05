import type { ShlokaStudySection } from "../types";

export interface ShlokaStudyPalette {
  accent: string;
  card: string;
  content: string;
  title: string;
  meta: string;
  tag: string;
}

export const SHLOKA_STUDY_PALETTES: Record<ShlokaStudySection, ShlokaStudyPalette> = {
  verse: {
    accent: "#6366f1",
    card: "border-indigo-400/80 bg-indigo-50/95 dark:border-indigo-400/70 dark:bg-indigo-950/40",
    content: "border-indigo-200/80 bg-indigo-100/75 dark:border-indigo-700/60 dark:bg-indigo-900/35",
    title: "text-indigo-950 dark:text-indigo-50",
    meta: "text-indigo-700 dark:text-indigo-300",
    tag: "border-indigo-300/80 bg-indigo-100/70 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-200",
  },
  padaccheda: {
    accent: "#f97316",
    card: "border-orange-400/80 bg-orange-50/95 dark:border-orange-400/70 dark:bg-orange-950/40",
    content: "border-orange-200/80 bg-orange-100/75 dark:border-orange-700/60 dark:bg-orange-900/35",
    title: "text-orange-950 dark:text-orange-50",
    meta: "text-orange-700 dark:text-orange-300",
    tag: "border-orange-300/80 bg-orange-100/70 text-orange-800 dark:border-orange-600 dark:bg-orange-900/50 dark:text-orange-200",
  },
  anvaya: {
    accent: "#0ea5e9",
    card: "border-sky-400/80 bg-sky-50/95 dark:border-sky-400/70 dark:bg-sky-950/40",
    content: "border-sky-200/80 bg-sky-100/75 dark:border-sky-700/60 dark:bg-sky-900/35",
    title: "text-sky-950 dark:text-sky-50",
    meta: "text-sky-700 dark:text-sky-300",
    tag: "border-sky-300/80 bg-sky-100/70 text-sky-800 dark:border-sky-600 dark:bg-sky-900/50 dark:text-sky-200",
  },
  padartha: {
    accent: "#10b981",
    card: "border-emerald-400/80 bg-emerald-50/95 dark:border-emerald-400/70 dark:bg-emerald-950/40",
    content: "border-emerald-200/80 bg-emerald-100/75 dark:border-emerald-700/60 dark:bg-emerald-900/35",
    title: "text-emerald-950 dark:text-emerald-50",
    meta: "text-emerald-700 dark:text-emerald-300",
    tag: "border-emerald-300/80 bg-emerald-100/70 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-200",
  },
  translation: {
    accent: "#8b5cf6",
    card: "border-violet-400/80 bg-violet-50/95 dark:border-violet-400/70 dark:bg-violet-950/40",
    content: "border-violet-200/80 bg-violet-100/75 dark:border-violet-700/60 dark:bg-violet-900/35",
    title: "text-violet-950 dark:text-violet-50",
    meta: "text-violet-700 dark:text-violet-300",
    tag: "border-violet-300/80 bg-violet-100/70 text-violet-800 dark:border-violet-600 dark:bg-violet-900/50 dark:text-violet-200",
  },
  grammar: {
    accent: "#f43f5e",
    card: "border-rose-400/80 bg-rose-50/95 dark:border-rose-400/70 dark:bg-rose-950/40",
    content: "border-rose-200/80 bg-rose-100/75 dark:border-rose-700/60 dark:bg-rose-900/35",
    title: "text-rose-950 dark:text-rose-50",
    meta: "text-rose-700 dark:text-rose-300",
    tag: "border-rose-300/80 bg-rose-100/70 text-rose-800 dark:border-rose-600 dark:bg-rose-900/50 dark:text-rose-200",
  },
  chandas: {
    accent: "#06b6d4",
    card: "border-cyan-400/80 bg-cyan-50/95 dark:border-cyan-400/70 dark:bg-cyan-950/40",
    content: "border-cyan-200/80 bg-cyan-100/75 dark:border-cyan-700/60 dark:bg-cyan-900/35",
    title: "text-cyan-950 dark:text-cyan-50",
    meta: "text-cyan-700 dark:text-cyan-300",
    tag: "border-cyan-300/80 bg-cyan-100/70 text-cyan-800 dark:border-cyan-600 dark:bg-cyan-900/50 dark:text-cyan-200",
  },
  notes: {
    accent: "#eab308",
    card: "border-yellow-400/80 bg-yellow-50/95 dark:border-yellow-400/70 dark:bg-yellow-950/40",
    content: "border-yellow-200/80 bg-yellow-100/75 dark:border-yellow-700/60 dark:bg-yellow-900/35",
    title: "text-yellow-950 dark:text-yellow-50",
    meta: "text-yellow-700 dark:text-yellow-300",
    tag: "border-yellow-300/80 bg-yellow-100/70 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-200",
  },
  memorization: {
    accent: "#d946ef",
    card: "border-fuchsia-400/80 bg-fuchsia-50/95 dark:border-fuchsia-400/70 dark:bg-fuchsia-950/40",
    content: "border-fuchsia-200/80 bg-fuchsia-100/75 dark:border-fuchsia-700/60 dark:bg-fuchsia-900/35",
    title: "text-fuchsia-950 dark:text-fuchsia-50",
    meta: "text-fuchsia-700 dark:text-fuchsia-300",
    tag: "border-fuchsia-300/80 bg-fuchsia-100/70 text-fuchsia-800 dark:border-fuchsia-600 dark:bg-fuchsia-900/50 dark:text-fuchsia-200",
  },
};
