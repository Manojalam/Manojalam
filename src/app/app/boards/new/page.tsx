"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBoard } from "@/lib/storage/board-store";
import { toast } from "sonner";
import { BoardFolderPicker } from "@/components/layout/BoardFolderPicker";
import { changeOrganization, loadOrganization, type BoardOrganization } from "@/lib/storage/board-organization";

export default function NewBoardPage() {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [organization, setOrganization] = useState<BoardOrganization>({ folders: [], assignments: {} });
  const [folder, setFolder] = useState("");
  const [folderLoading, setFolderLoading] = useState(true);
  const [folderError, setFolderError] = useState("");
  const [createdBoard, setCreatedBoard] = useState<string | null>(null);
  const creating = useRef(false);
  const refreshFolders = async () => { setOrganization(await loadOrganization()); setFolderError(""); };
  useEffect(() => {
    void loadOrganization().then(value => {
      setOrganization(value);
      const initial = new URLSearchParams(window.location.search).get("folder");
      if (value.folders.some(item => item.id === initial)) setFolder(initial!);
    }).catch(error => setFolderError(error instanceof Error ? error.message : "Could not load folders."))
      .finally(() => setFolderLoading(false));
  }, []);

  const handleCreate = async () => {
    if (creating.current || folderLoading) return;
    creating.current = true;
    setLoading(true);
    try {
      const id = createdBoard ?? (await createBoard(undefined, title.trim() || "Untitled Board")).id;
      setCreatedBoard(id);
      if (folder) await changeOrganization({ type: "move", boardId: id, folderId: folder });
      toast.success("Board created");
      router.push(`/app/boards/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create board");
      setLoading(false);
    } finally { creating.current = false; }
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
              disabled={loading || !!createdBoard}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Board"
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-1">
            <Label>Folder</Label>
            <BoardFolderPicker label="Board folder" organization={organization} value={folder} onChange={setFolder} onCreated={refreshFolders} disabled={loading || folderLoading || !!folderError} />
            {folderLoading && <p className="text-sm text-muted-foreground">Loading folders…</p>}
            {folderError && <p role="alert" className="text-sm text-destructive">{folderError} <button className="underline" onClick={() => void refreshFolders().catch(error => setFolderError(error instanceof Error ? error.message : "Could not load folders."))}>Retry</button></p>}
            {createdBoard && !loading && <p role="alert" className="text-sm">Your board was created, but its folder could not be saved. Retry below or <Link className="underline" href={`/app/boards/${createdBoard}`}>open the board</Link>.</p>}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={loading || folderLoading}>
              {loading ? "Creating…" : createdBoard ? "Retry folder assignment" : "Create board"}
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
