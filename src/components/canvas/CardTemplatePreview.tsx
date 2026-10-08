"use client";

import { RichTextEditor } from "./RichTextEditor";
import { useEffect, useRef, useState } from "react";
import type { BoardCardTemplate, CardFieldValues, CardSection } from "@/lib/types";
import { renderCardSections, renderCardTemplate } from "@/lib/canvas/card-templates";

/** Fit the whole card in the preview without changing its wrapping or indentation. */
export function CardTemplatePreview({ template, values, extraRows, sections }: { template: BoardCardTemplate; values?: CardFieldValues; extraRows?: string[]; sections?: CardSection[] }) {
  const container = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(200);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (container.current) setWidth(container.current.clientWidth);
      if (card.current) setHeight(card.current.offsetHeight);
    });
    if (container.current) observer.observe(container.current);
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, width / 600);
  return <div ref={container} className="w-full overflow-hidden">
    <div className="relative" style={{ height: height * scale }}>
      <div ref={card} aria-label="Template text preview" className="absolute left-0 top-0 p-2" style={{ color: template.style.textColor, fontFamily: template.style.fontFamily || undefined, fontSize: template.style.fontSize, width: 600, transform: `scale(${scale})`, transformOrigin: "top left" }} ><RichTextEditor templateText editable={false} initialContent={(sections ? renderCardSections(template, sections) : renderCardTemplate(template, values, extraRows)).richText} onChange={() => {}} /></div>
    </div>
  </div>;
}
