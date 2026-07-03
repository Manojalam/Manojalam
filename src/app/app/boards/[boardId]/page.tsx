"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBoard } from "@/lib/storage/board-store";
import { useCanvasStore } from "@/store/canvas-store";
import { CanvasTopbar } from "@/components/canvas/CanvasTopbar";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { CanvasInspector } from "@/components/canvas/CanvasInspector";
import { CanvasStatusBar } from "@/components/canvas/CanvasStatusBar";
import { VidyaCanvas } from "@/components/canvas/VidyaCanvas";
import { SanskritToolsPanel } from "@/components/sanskrit/SanskritToolsPanel";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { SearchPanel } from "@/components/layout/SearchPanel";

export default function BoardEditorPage() {
  const params = useParams();
  const boardId = params.boardId as string;
  const [loading, setLoading] = useState(true);
  const setBoard = useCanvasStore((s) => s.setBoard);
  const pushHistory = useCanvasStore((s) => s.pushHistory);

  useEffect(() => {
    getBoard(boardId).then((board) => {
      if (board) {
        setBoard(board);
        pushHistory();
      }
      setLoading(false);
    });
  }, [boardId, setBoard, pushHistory]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">V</div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading board…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <CanvasTopbar />

      {/* Canvas + floating overlays */}
      <div className="relative flex-1 overflow-hidden">
        {/* Canvas fills entire space */}
        <VidyaCanvas boardId={boardId} />

        {/* Floating left toolbar */}
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <div className="pointer-events-auto">
            <CanvasToolbar />
          </div>
        </div>

        {/* Floating right inspector */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-start pt-3 pr-3">
          <div className="pointer-events-auto max-h-[calc(100vh-100px)] overflow-y-auto">
            <CanvasInspector />
          </div>
        </div>

        {/* Status bar inside canvas area */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 flex justify-center pb-3">
          <div className="pointer-events-auto">
            <CanvasStatusBar />
          </div>
        </div>
      </div>

      <SanskritToolsPanel />
      <CommandPalette />
      <SearchPanel />
    </div>
  );
}
