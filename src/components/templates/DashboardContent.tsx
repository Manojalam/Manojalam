"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, LayoutTemplate, Lightbulb, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listBoards } from "@/lib/storage/board-store";
import { formatRelativeDate } from "@/lib/utils";
import type { VidyaBoard } from "@/lib/types";
import { SupabaseSetupNotice } from "@/components/layout/SupabaseSetupNotice";

export function DashboardContent() {
  const [boards, setBoards] = useState<VidyaBoard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listBoards()
      .then(setBoards)
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, []);

  const recent = boards.slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your visual knowledge workspace</p>
      </div>

      <SupabaseSetupNotice className="mb-6" />

      <div className="mb-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/app/boards/new"><Plus className="mr-2 h-4 w-4" /> New blank board</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/app/templates"><LayoutTemplate className="mr-2 h-4 w-4" /> New from template</Link>
        </Button>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Recent boards</h2>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/50" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="text-muted-foreground">No boards yet. Create your first one!</p>
            <Button className="mt-4" asChild>
              <Link href="/app/boards/new">Create board</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((board) => (
              <Link
                key={board.id}
                href={`/app/boards/${board.id}`}
                className="group rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium group-hover:text-primary">{board.title}</h3>
                  {board.accessRole !== "owner" && (
                    <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                      <Users className="h-3 w-3" />
                      {board.accessRole === "editor" ? "Can edit" : "View only"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeDate(board.updatedAt)} · {board.content.nodes.length} nodes
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-muted/30 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold">Quick tips</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            "Tab = child node",
            "Enter = sibling",
            "⌘/Ctrl+K = command palette",
            "⌘/Ctrl+S = save",
            "⌘/Ctrl+Z = undo",
          ].map((tip) => (
            <Badge key={tip} variant="secondary" className="font-normal">{tip}</Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
