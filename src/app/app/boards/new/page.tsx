"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBoard } from "@/lib/storage/board-store";
import { toast } from "sonner";

export default function NewBoardPage() {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    setLoading(true);
    try {
      const board = await createBoard(undefined, title || "Untitled Board");
      toast.success("Board created");
      router.push(`/app/boards/${board.id}`);
    } catch {
      toast.error("Failed to create board");
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-bold">New Board</h1>
        <p className="mt-1 text-muted-foreground">Start with a blank canvas</p>

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="title">Board title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Board"
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "Create board"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/templates">Browse templates</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
