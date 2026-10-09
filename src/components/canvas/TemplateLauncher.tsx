"use client";

import { CardTemplatesPanel } from "./CardTemplatesPanel";
import { CrossBoardTemplateLibrary } from "./CrossBoardTemplateLibrary";

/** A single entry point for creating, editing and using reusable text. */
export function TemplateLauncher() {
  return <>
    <CardTemplatesPanel />
    <details className="border-b"><summary className="cursor-pointer p-3 text-xs font-semibold">From other boards</summary><CrossBoardTemplateLibrary /></details>
  </>;
}
