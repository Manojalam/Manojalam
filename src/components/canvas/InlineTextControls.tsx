"use client";
import { useCallback } from "react";
import { useUIStore } from "@/store/ui-store";
/** The active editor renders its full toolbar here; no second formatting implementation. */
export function InlineTextControls({ nodeId }: { nodeId: string }) {
  const attach = useCallback((element: HTMLDivElement | null) => {
    const current = useUIStore.getState().inlineTextToolbarHost;
    if (element) useUIStore.setState({ inlineTextToolbarHost: { nodeId, element } });
    else if (current?.nodeId === nodeId) useUIStore.setState({ inlineTextToolbarHost: null });
  }, [nodeId]);
  return <div ref={attach} data-universal-text-tools="inspector" aria-label="Selected text controls" className="p-2" />;
}
