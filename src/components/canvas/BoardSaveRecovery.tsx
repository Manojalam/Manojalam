"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { backupKey, readBoardBackup, saveErrorMessage, type BoardBackup } from "@/lib/storage/board-backup";
import { getRecoveryUserId } from "@/lib/storage/board-store";
import { downloadJson } from "@/lib/export";
import type { BoardContent } from "@/lib/types";
import { BOARD_CONTENT_VERSION } from "@/lib/config";

export function BoardSaveRecovery() {
  const boardId = useCanvasStore(s => s.board?.id);
  const error = useCanvasStore(s => s.saveError);
  const status = useCanvasStore(s => s.saveStatus);
  const backupStatus = useCanvasStore(s => s.backupStatus);
  const [recovery, setRecovery] = useState<BoardBackup | null>(null);
  useEffect(() => {
    let active = true;
    if (boardId) void getRecoveryUserId().then(user => readBoardBackup(backupKey(user, boardId))).then(backup => {
      if (active) setRecovery(status === "error" && backup?.pending ? backup : null);
    }).catch(error => {
      if (active) useCanvasStore.setState({ backupStatus: "error", saveError: `Cannot read local recovery: ${saveErrorMessage(error)}` });
    });
    return () => { active = false; };
  }, [boardId, status]);
  const currentBackup = () => {
    const s = useCanvasStore.getState();
    if (s.board) downloadJson({ ...s.board, content: { version: BOARD_CONTENT_VERSION,
      nodes: s.nodes, edges: s.edges, relationships: s.relationships, relationshipFans: s.relationshipFans,
      layers: s.layers, viewport: s.viewport, settings: s.settings } as BoardContent });
  };
  if (!error && status !== "error" && !recovery) return null;
  return <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
    {recovery && <>
      <span>Unsynced local backup from {new Date(recovery.savedAt).toLocaleString()} ({recovery.board.content.nodes.length} objects).</span>
      <button className="underline" onClick={() => downloadJson(recovery.board)}>Download local backup</button>
    </>}
    {error && <span className="break-words">{status === "saved" ? "Backup warning" : "Save failed"}: {error}</span>}
    {(status === "error" || error) && <>
      <span>{backupStatus === "saved" ? "A recovery copy is saved on this device." : "Local backup is not confirmed. Download a backup before leaving."}</span>
      <button className="underline" onClick={() => {
        useCanvasStore.setState({ saveStatus: "unsaved", hasUserChangedBoard: true });
        window.dispatchEvent(new Event("vidya:retry-save"));
      }}>Retry save</button>
      <button className="underline" onClick={currentBackup}>Download current board</button>
    </>}
  </div>;
}
