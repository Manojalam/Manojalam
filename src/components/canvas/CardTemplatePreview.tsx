"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardCardTemplate, CardFieldValues } from "@/lib/types";
import { renderCardTemplate } from "@/lib/canvas/card-templates";

/** Fit the whole card in the preview without changing its wrapping or indentation. */
export function CardTemplatePreview({ template, values }: { template: BoardCardTemplate; values?: CardFieldValues }) {
  const container = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(template.style.width);
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
  const scale = Math.min(1, width / template.style.width);
  return <div ref={container} className="w-full overflow-hidden">
    <div className="relative" style={{ height: height * scale }}>
      <div ref={card} aria-label="Card template preview" className="absolute left-0 top-0 rounded-xl border-2 p-6" style={{ background: template.style.fillColor, borderColor: template.style.borderColor, color: template.style.textColor, fontSize: template.style.fontSize, width: template.style.width, transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: renderCardTemplate(template, values).richText }} />
    </div>
  </div>;
}
