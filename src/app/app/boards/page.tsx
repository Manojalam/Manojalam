"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Copy, Trash2, ExternalLink, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listBoards, deleteBoard, duplicateBoard, getStorageUserId, moveGuestBoardToAccount } from "@/lib/storage/board-store";
import { formatRelativeDate } from "@/lib/utils";
import type { VidyaBoard } from "@/lib/types";
import { toast } from "sonner";

export default function BoardsPage() {
  const [boards, setBoards] = useState<VidyaBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMove = async (id: string) => {
    if (moving) return;
    setMoving(id);
    try {
      await moveGuestBoardToAccount(id);
      toast.success("Board saved to your account");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Your device board has been kept.");
    } finally { setMoving(null); }
  };

  const refresh = () => listBoards().then((boards) => { setBoards(boards); setError(null); }).catch((error) => setError(error instanceof Error ? error.message : "Could not load boards. Please retry."));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    void getStorageUserId().then((id) => setSignedIn(Boolean(id))).catch(() => undefined);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this board?")) return;
    try {
      await deleteBoard(id);
      toast.success("Board deleted");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete board.");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await duplicateBoard(id);
      if (copy) { toast.success("Board duplicated"); await refresh(); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate board.");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Boards</h1>
            <p className="text-muted-foreground">Your device boards and cloud boards</p>
          </div>
          <Button asChild>
            <Link href="/app/boards/new"><Plus className="mr-2 h-4 w-4" /> New board</Link>
          </Button>
        </div>

        {boards.some((board) => board.storageMode === "local") && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-4 text-sm">
            Device boards stay in this browser until you move them to an account. Download JSON backups from the Export menu in the editor.
            {signedIn ? " Use Save to account below to move each board to your signed-in account." : <Link className="ml-1 text-primary underline" href="/auth/sign-in?next=/app/boards">Sign in to save them to the cloud</Link>}
          </div>
        )}
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{error} <button className="underline" onClick={() => void refresh()}>Retry</button></p>}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/50" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <p className="text-muted-foreground">No boards yet</p>
            <Button className="mt-4" asChild>
              <Link href="/app/boards/new">Create your first board</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {boards.map((board) => (
              <div key={board.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{board.title}</h3>
                    {board.storageMode === "local" && <Badge variant="outline">On this device</Badge>}
                    {board.accessRole !== "owner" && (
                      <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                        <Users className="h-3 w-3" />
                        {board.accessRole === "editor" ? "Shared · Can edit" : "Shared · View only"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatRelativeDate(board.updatedAt)} · {board.content.nodes.length} nodes
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {board.storageMode === "local" && signedIn && (
                    <Button variant="outline" size="sm" disabled={moving !== null} onClick={() => void handleMove(board.id)}>
                      {moving === board.id ? "Uploading..." : "Save to account"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/app/boards/${board.id}`}>
                      <ExternalLink className="mr-1 h-3 w-3" /> Open
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(board.id)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  {board.accessRole === "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete ${board.title}`}
                      onClick={() => handleDelete(board.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
