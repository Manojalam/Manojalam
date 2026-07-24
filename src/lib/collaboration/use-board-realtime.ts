"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  rowToBoard,
  type BoardRow,
} from "@/lib/storage/board-store";
import { useCanvasStore } from "@/store/canvas-store";

type RealtimeBoardRow = BoardRow & {
  updated_by?: string | null;
};

/**
 * Applies collaborator saves while the local board is clean. If both people
 * edit at once, the local draft wins and the user is warned instead.
 */
export function useBoardRealtime(boardId: string) {
  const lastRemoteUpdateRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let active = true;
    let channel: RealtimeChannel | null = null;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const currentUserId = data.user?.id ?? null;
      channel = supabase
        .channel(`board-updates:${boardId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "boards",
            filter: `id=eq.${boardId}`,
          },
          (payload) => {
            if (!active) return;
            const row = payload.new as RealtimeBoardRow;
            if (!row.id || row.id !== boardId) return;

            const state = useCanvasStore.getState();
            if (!state.board || state.board.id !== boardId) return;

            if (row.updated_by && row.updated_by === currentUserId) {
              useCanvasStore.setState({
                board: {
                  ...state.board,
                  updatedAt: row.updated_at,
                },
              });
              return;
            }

            if (lastRemoteUpdateRef.current === row.updated_at) return;
            lastRemoteUpdateRef.current = row.updated_at;

            if (state.saveStatus !== "saved") {
              toast.warning(
                "A collaborator saved a newer version. Your unsaved work was kept; reload after saving to review it."
              );
              return;
            }

            const nextBoard = rowToBoard(row, state.board.accessRole);
            state.setBoard(nextBoard);
            useCanvasStore.getState().pushHistory();
            toast.info("This board was updated by a collaborator.");
          }
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [boardId]);
}
