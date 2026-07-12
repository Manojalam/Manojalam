"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useCanvasStore } from "@/store/canvas-store";

interface AutoFitOptions {
  nodeId: string;
  boxRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
}

function lineMetrics(element: HTMLElement): { lineCount: number; lineHeight: number } {
  const computed = window.getComputedStyle(element);
  const fontSize = Number.parseFloat(computed.fontSize) || 14;
  const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.35;
  const text = element.innerText || element.textContent || "";
  const explicitLines = Math.max(1, text.replace(/\r\n/g, "\n").split("\n").length);
  const rect = element.getBoundingClientRect();
  const height = Math.max(element.scrollHeight, rect.height);
  return {
    lineHeight,
    lineCount: Math.max(explicitLines, Math.ceil(height / Math.max(1, lineHeight))),
  };
}

export function useNodeContentAutoFit({ nodeId, boxRef, contentRef }: AutoFitOptions) {
  const fitNodeToContent = useCanvasStore((state) => state.fitNodeToContent);
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const boxRect = box.getBoundingClientRect();
    if (boxRect.width <= 0 || boxRect.height <= 0) return;
    const editor = content.querySelector(".ProseMirror") as HTMLElement | null;
    const measuredElement = editor ?? content;
    const contentHeight = Math.ceil(Math.max(
      content.scrollHeight,
      editor?.scrollHeight ?? 0,
      measuredElement.offsetHeight
    ));
    const scrollWidth = Math.max(content.scrollWidth, editor?.scrollWidth ?? 0);
    const clientWidth = Math.max(content.clientWidth, editor?.clientWidth ?? 0);
    const contentWidth = scrollWidth > clientWidth + 2 ? Math.ceil(scrollWidth) : 0;
    if (contentHeight <= 0) return;

    const { lineCount, lineHeight } = lineMetrics(measuredElement);
    fitNodeToContent(nodeId, {
      width: contentWidth,
      height: contentHeight,
      lineCount,
      lineHeight,
    });
  }, [boxRef, contentRef, fitNodeToContent, nodeId]);

  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      measure();
      frameRef.current = requestAnimationFrame(measure);
    });
  }, [measure]);

  useLayoutEffect(() => {
    scheduleMeasure();
    return () => cancelAnimationFrame(frameRef.current);
  }, [scheduleMeasure]);

  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [boxRef, contentRef, scheduleMeasure]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver(scheduleMeasure);
    observer.observe(content, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [contentRef, scheduleMeasure]);
}
