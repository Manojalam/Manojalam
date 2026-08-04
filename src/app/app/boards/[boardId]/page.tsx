"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getBoard } from "@/lib/storage/board-store";
import { useCanvasStore } from "@/store/canvas-store";
import { CanvasTopbar } from "@/components/canvas/CanvasTopbar";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { CanvasInspector } from "@/components/canvas/CanvasInspector";
import { LayoutPanel } from "@/components/canvas/LayoutPanel";
import { CanvasStatusBar } from "@/components/canvas/CanvasStatusBar";
import { VidyaCanvas } from "@/components/canvas/VidyaCanvas";
import { SanskritToolsPanel } from "@/components/sanskrit/SanskritToolsPanel";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { SearchPanel } from "@/components/layout/SearchPanel";
import { useDeviceProfile } from "@/lib/use-device-profile";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";
import { buildHierarchy, getSubtree } from "@/lib/layout/hierarchy";
import { isImportLayoutMode } from "@/lib/import/layouts";

export default function BoardEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = params.boardId as string;
  const consumedImportRef = useRef<string | null>(null);
  const fittedTemplateBoardRef = useRef<string | null>(null);
  const fromTemplate = searchParams.get("fromTemplate") === "1";
  const hasPrefetchedTemplateBoard = (() => {
    const prefetchedBoard = useCanvasStore.getState().board;
    return fromTemplate
      && prefetchedBoard?.id === boardId
      && prefetchedBoard.content.nodes.length > 0;
  })();
  const [loading, setLoading] = useState(!hasPrefetchedTemplateBoard);
  const [notFound, setNotFound] = useState(false);
  const beginBoardHydration = useCanvasStore((s) => s.beginBoardHydration);
  const setBoard = useCanvasStore((s) => s.setBoard);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const board = useCanvasStore((s) => s.board);
  const layoutPanelOpen = useUIStore((s) => s.layoutPanelOpen);
  const relationshipSelection = useUIStore((s) => s.relationshipSelection);
  const device = useDeviceProfile();
  const isPhone = device.kind === "phone";
  const canEdit = board?.accessRole !== "viewer";

  useEffect(() => {
    let active = true;
    useUIStore.getState().cancelRelationshipSelection();

    const prefetchedBoard = useCanvasStore.getState().board;
    if (
      fromTemplate
      && prefetchedBoard?.id === boardId
      && prefetchedBoard.content.nodes.length > 0
    ) {
      pushHistory();
      return () => {
        active = false;
        useUIStore.getState().cancelRelationshipSelection();
      };
    }

    beginBoardHydration();
    getBoard(boardId)
      .then((board) => {
        if (!active) return;
        if (board) {
          setBoard(board);
          pushHistory();
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      useUIStore.getState().cancelRelationshipSelection();
    };
  }, [beginBoardHydration, boardId, fromTemplate, setBoard, pushHistory]);

  useEffect(() => {
    if (
      !fromTemplate
      || loading
      || !board
      || board.id !== boardId
      || fittedTemplateBoardRef.current === boardId
    ) return;

    const state = useCanvasStore.getState();
    const nodeIds = state.nodes.filter((node) => !node.hidden).map((node) => node.id);
    if (!nodeIds.length) return;
    fittedTemplateBoardRef.current = boardId;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("vidya:fitview", {
          detail: { nodeIds, forceFit: true },
        }));
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [board, boardId, fromTemplate, loading]);

  useEffect(() => {
    if (loading || !board || board.id !== boardId) return;
    const modeValue = searchParams.get("importLayout");
    const rootId = searchParams.get("importRoot");
    if (!modeValue && !rootId) return;
    const importKey = `${boardId}:${modeValue ?? ""}:${rootId ?? ""}`;
    if (consumedImportRef.current === importKey) return;
    consumedImportRef.current = importKey;

    const cleanImportParams = () => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("importLayout");
      next.delete("importRoot");
      const query = next.toString();
      router.replace(`/app/boards/${boardId}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    };

    const state = useCanvasStore.getState();
    if (!isImportLayoutMode(modeValue) || !rootId || !state.nodes.some((node) => node.id === rootId)) {
      cleanImportParams();
      return;
    }
    const mode = modeValue;

    const frame = requestAnimationFrame(() => {
      const current = useCanvasStore.getState();
      const hierarchy = buildHierarchy(current.nodes, current.edges);
      const nodeIds = getSubtree(rootId, hierarchy);
      if (mode === "cards") {
        window.dispatchEvent(new CustomEvent("vidya:fitview", {
          detail: { mode, rootId, nodeIds, forceFit: true },
        }));
      } else if (mode === "list" || mode === "matrix") {
        window.dispatchEvent(new CustomEvent("vidya:apply-measured-layout", {
          detail: { mode, rootId, nodeIds, fitAfter: true },
        }));
      } else {
        current.applyLayout(mode, rootId);
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("vidya:fitview", {
            detail: { mode, rootId, nodeIds, forceFit: true },
          }));
        });
      }
      cleanImportParams();
    });
    return () => cancelAnimationFrame(frame);
  }, [board, boardId, loading, router, searchParams]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="logo-font h-8 w-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-base">म</div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading board…</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Board not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Board not found or you do not have access.
          </p>
          <Link href="/app/boards" className="mt-4 inline-block text-sm text-primary hover:underline">
            Back to your boards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden bg-background"
      data-device-kind={device.kind}
      data-platform={device.platform}
      data-input={device.input}
    >
      <CanvasTopbar />

      {/* Canvas + floating overlays */}
      <div className="relative flex-1 overflow-hidden">
        {/* Canvas fills entire space */}
        <VidyaCanvas boardId={boardId} canEdit={canEdit} />

        {/* Floating left toolbar */}
        {canEdit && <div
          className={cn(
            "pointer-events-none absolute z-30 flex",
            isPhone
              ? "inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+2.75rem)] justify-center px-3"
              : "inset-y-0 left-0 items-center pl-3"
          )}
        >
          {!relationshipSelection && (
            <div className="pointer-events-auto">
              <CanvasToolbar />
            </div>
          )}
        </div>}

        {/* Floating layout panel (left, next to toolbar) */}
        {canEdit && <div
          className={cn(
            "pointer-events-none absolute z-40 flex",
            isPhone
              ? "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] justify-center"
              : "inset-y-0 left-16 items-start pt-3"
          )}
        >
          {!relationshipSelection && (
            <div className="pointer-events-auto">
              <LayoutPanel />
            </div>
          )}
        </div>}

        {/* Floating right inspector */}
        {canEdit && <div
          className={cn(
            "pointer-events-none absolute z-40 flex",
            isPhone
              ? "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] justify-center"
              : "inset-y-0 right-0 items-start pt-3 pr-3"
          )}
        >
          {!relationshipSelection && (
            <div className="pointer-events-auto max-h-[calc(100dvh-100px)] overflow-y-auto">
              {!(isPhone && layoutPanelOpen) && <CanvasInspector compact={isPhone} />}
            </div>
          )}
        </div>}

        {!canEdit && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
            <div className="rounded-full border border-sky-200 bg-background/95 px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm backdrop-blur dark:border-sky-900 dark:text-sky-300">
              View-only access · pan and zoom are available
            </div>
          </div>
        )}

        {/* Status bar inside canvas area */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 flex justify-center",
            isPhone ? "bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]" : "bottom-0 pb-3"
          )}
        >
          <div className="pointer-events-auto">
            <CanvasStatusBar />
          </div>
        </div>
      </div>

      {canEdit && <SanskritToolsPanel />}
      {canEdit && <CommandPalette />}
      <SearchPanel />
    </div>
  );
}
