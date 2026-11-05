"use client";

import type { ReactNode } from "react";
import { COLOR_SWATCH_GROUPS } from "@/lib/canvas/custom-colors";

/** Keep every picker in the same hue-family and light-to-dark order. */
export function GeneralColorGrid({ renderSwatch }: {
  renderSwatch: (color: string, family: string) => ReactNode;
}) {
  return <div className="space-y-2" aria-label="Color wheel families, light to dark">
    <p className="text-[9px] text-muted-foreground">Hue families · light → vivid → dark</p>
    {COLOR_SWATCH_GROUPS.map(group => <section key={group.name} aria-label={`${group.name} colors`}>
      <p className="mb-1 text-[9px] font-medium text-muted-foreground">{group.name}</p>
      <div className="grid grid-cols-10 gap-1">
        {group.colors.map(color => <span key={color}>{renderSwatch(color, group.name)}</span>)}
      </div>
    </section>)}
  </div>;
}
