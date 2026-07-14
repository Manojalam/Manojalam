"use client";

import { useEffect } from "react";

export function useNodeTextEditRequest(nodeId: string, beginEditing: () => void): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === nodeId) beginEditing();
    };
    window.addEventListener("vidya:edit-node", handler);
    return () => window.removeEventListener("vidya:edit-node", handler);
  }, [beginEditing, nodeId]);
}
