"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Copy, Trash2, ExternalLink, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listBoards, deleteBoard, duplicateBoard } from "@/lib/storage/board-store";
import { formatRelativeDate } from "@/lib/utils";
import type { VidyaBoard } from "@/lib/types";
import { toast } from "sonner";

export default function BoardsPage() {
  const [boards, setBoards] = useState<VidyaBoard[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => listBoards().then(setBoards).catch(() => setBoards([]));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this board?")) return;
    await deleteBoard(id);
    toast.success("Board deleted");
    refresh();
  };

  const handleDuplicate = async (id: string) => {
    const copy = await duplicateBoard(id);
    if (copy) {
      toast.success("Board duplicated");
      refresh();
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Boards</h1>
            <p className="text-muted-foreground">Boards you own and boards shared with you</p>
          </div>
          <Button asChild>
            <Link href="/app/boards/new"><Plus className="mr-2 h-4 w-4" /> New board</Link>
          </Button>
        </div>

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
                <div className="flex gap-1">
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
