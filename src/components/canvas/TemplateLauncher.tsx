"use client";

import { CardTemplatesPanel } from "./CardTemplatesPanel";
import { CrossBoardTemplateLibrary } from "./CrossBoardTemplateLibrary";
import { SampleTemplatesPanel } from "./SampleTemplatesPanel";
import { BoardStyleTemplatesPanel } from "./BoardStyleTemplatesPanel";

/** A single entry point for creating, editing and using reusable text. */
export function TemplateLauncher() {
  return <>
    <CardTemplatesPanel />
    <details className="border-b"><summary className="cursor-pointer p-3 text-xs font-semibold">From other boards</summary><CrossBoardTemplateLibrary /></details>
    <details className="border-b"><summary className="cursor-pointer p-3 text-xs font-semibold">Saved object designs</summary><SampleTemplatesPanel /></details>
    <details className="border-b"><summary className="cursor-pointer p-3 text-xs font-semibold">Linked object styles</summary><BoardStyleTemplatesPanel /></details>
  </>;
}
