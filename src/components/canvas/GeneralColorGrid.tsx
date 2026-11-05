"use client";

import type { ReactNode } from "react";
import { COLOR_SWATCH_GROUPS } from "@/lib/canvas/custom-colors";

/** Keep every picker in the same hue-family and light-to-dark order. */
export function GeneralColorGrid({ renderSwatch }: {
  renderSwatch: (color: string, family: string) => ReactNode;
}) {
  return <div className="space-y-1" aria-label="Color wheel families, light to dark">
    <p className="text-[9px] text-muted-foreground">Hue families · light → vivid → dark</p>
    {COLOR_SWATCH_GROUPS.map(group => <section key={group.name} aria-label={`${group.name} colors`} className="grid grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-1">
      <p className="text-[9px] font-medium text-muted-foreground">{group.name}</p>
      <div className="grid grid-cols-10 gap-0.5">
        {group.colors.map(color => <span key={color} className="block h-5 min-w-0 [&>button]:h-full [&>button]:w-full [&>span]:h-full [&>span]:w-full">{renderSwatch(color, group.name)}</span>)}
      </div>
    </section>)}
  </div>;
}
