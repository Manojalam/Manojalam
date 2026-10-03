"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Copy, Trash2, Users, FolderPlus, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listBoards, deleteBoard, duplicateBoard, getStorageUserId, moveGuestBoardToAccount } from "@/lib/storage/board-store";
import { formatRelativeDate } from "@/lib/utils";
import type { VidyaBoard } from "@/lib/types";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { changeOrganization, loadOrganization, canParentFolder, folderOptions, folderPath, type BoardOrganization, type OrganizationAction } from "@/lib/storage/board-organization";
import { filterBoards, type BoardSort } from "@/lib/storage/board-list";

export default function BoardsPage() {
  const [boards, setBoards] = useState<VidyaBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<BoardOrganization>({ folders: [], assignments: {} });
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folder, setFolder] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BoardSort>("updated");
  const [busy, setBusy] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string; parentId?: string | null } | null>(null);
  const visibleBoards = filterBoards(boards, organization, folder, query, sort);
  const selectedFolder = organization.folders.find((item) => item.id === folder);
  const path = selectedFolder ? folderPath(organization.folders, selectedFolder.id) : [];
  const destinations = folderOptions(organization.folders);
  const childFolders = organization.folders.filter((item) => (item.parentId ?? null) === (selectedFolder?.id ?? null))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const selectClass = "h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const refreshFolders = async () => {
    try { setOrganization(await loadOrganization()); setFolderError(null); }
    catch (error) { setFolderError(error instanceof Error ? error.message : "Could not load folders."); }
  };

  const organize = async (action: OrganizationAction) => {
    if (busy) return;
    setBusy(true);
    try {
      await changeOrganization(action);
      if (action.type === "delete") setFolder(organization.folders.find((item) => item.id === action.id)?.parentId ?? "all");
      if (action.type === "create" || action.type === "rename") setFolderDialog(null);
      await refreshFolders();
      toast.success(action.type === "move" ? "Board moved" : "Folder saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save folder changes."); }
    finally { setBusy(false); }
  };

  const handleMove = async (id: string) => {
    if (moving) return;
    setMoving(id);
    try {
      const folderId = organization.assignments[id];
      await moveGuestBoardToAccount(id);
      if (folderId) {
        try {
          await changeOrganization({ type: "move", boardId: id.slice("guest-".length), folderId });
          await changeOrganization({ type: "move", boardId: id, folderId: null });
          await refreshFolders();
        } catch { toast.error("Board uploaded, but its folder could not be transferred. You can move it again below."); }
      }
      toast.success("Board saved to your account");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Your device board has been kept.");
    } finally { setMoving(null); }
  };

  const refresh = () => listBoards().then((boards) => { setBoards(boards); setError(null); }).catch((error) => setError(error instanceof Error ? error.message : "Could not load boards. Please retry."));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    void loadOrganization().then(setOrganization).catch((error) => setFolderError(error instanceof Error ? error.message : "Could not load folders."));
    void getStorageUserId().then((id) => setSignedIn(Boolean(id))).catch(() => undefined);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this board?")) return;
    try {
      await deleteBoard(id);
      try { await changeOrganization({ type: "move", boardId: id, folderId: null }); await refreshFolders(); }
      catch { /* Stale personal metadata never prevents board deletion. */ }
      toast.success("Board deleted");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete board.");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await duplicateBoard(id);
      if (copy) {
        const folderId = organization.assignments[id];
        if (folderId) {
          try { await changeOrganization({ type: "move", boardId: copy.id, folderId }); await refreshFolders(); }
          catch { toast.error("Board duplicated, but its folder could not be copied."); }
        }
        toast.success("Board duplicated"); await refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate board.");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Boards</h1>
            <p className="text-muted-foreground">Your device boards and cloud boards</p>
          </div>
          <div className="flex gap-2">
          <Button variant="outline" disabled={busy || !!folderError} onClick={() => setFolderDialog({ name: "" })}>
            <FolderPlus className="mr-2 h-4 w-4" /> New folder
          </Button>
          <Button asChild>
            <Link href="/app/boards/new"><Plus className="mr-2 h-4 w-4" /> New board</Link>
          </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input type="search" aria-label="Search boards" placeholder="Search boards by title or description…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-48 flex-1" />
          <select aria-label="Sort boards" className={selectClass} value={sort} onChange={(event) => setSort(event.target.value as BoardSort)}>
            <option value="updated">Recently updated</option><option value="created">Newest created</option>
            <option value="title-asc">Name: A–Z</option><option value="title-desc">Name: Z–A</option>
          </select>
        </div>
        {folderError ? <p role="alert" className="mb-4 text-sm text-destructive">{folderError} <button className="underline" onClick={() => void refreshFolders()}>Retry</button></p> : (
          <div className="mb-4 space-y-3" aria-label="Board folders">
            <div className="flex flex-wrap items-center gap-2">
            {[{ id: "all", name: "All boards" }, { id: "unfiled", name: "Unfiled" }].map((item) => (
              <Button key={item.id} size="sm" variant={folder === item.id ? "default" : "outline"} aria-pressed={folder === item.id} onClick={() => setFolder(item.id)}>{item.name}</Button>
            ))}
            </div>
            {selectedFolder && <nav aria-label="Folder breadcrumbs" className="flex flex-wrap items-center gap-2 text-sm">
              <button className="text-primary underline" onClick={() => setFolder("all")}>Folders</button>
              {path.map((item, index) => <span key={item.id} className="flex items-center gap-2"><span aria-hidden="true">/</span>{index === path.length - 1 ? <span aria-current="location">{item.name}</span> : <button className="text-primary underline" onClick={() => setFolder(item.id)}>{item.name}</button>}</span>)}
            </nav>}
            <div className="flex flex-wrap items-center gap-2">
              {childFolders.map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => setFolder(item.id)}><FolderPlus className="mr-2 h-4 w-4" />{item.name}</Button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {selectedFolder && <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setFolderDialog({ name: "", parentId: selectedFolder.id })}><FolderPlus className="mr-2 h-4 w-4" /> New subfolder</Button>
              <label htmlFor="parent-folder" className="text-sm text-muted-foreground">Parent folder</label>
              <select id="parent-folder" className={`${selectClass} max-w-64`} disabled={busy} value={selectedFolder.parentId ?? ""} onChange={(event) => void organize({ type: "reparent", id: selectedFolder.id, parentId: event.target.value || null })}>
                <option value="">Top level</option>
                {destinations.filter((item) => canParentFolder(organization.folders, selectedFolder.id, item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <Button variant="ghost" size="icon" disabled={busy} aria-label={`Rename ${selectedFolder.name}`} onClick={() => setFolderDialog(selectedFolder)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" disabled={busy} aria-label={`Delete folder ${selectedFolder.name}`} onClick={() => { if (confirm(`Delete folder “${selectedFolder.name}”? Its direct boards will become unfiled. Subfolders will move to its parent, keeping their boards. No boards will be deleted.`)) void organize({ type: "delete", id: selectedFolder.id }); }}><Trash2 className="h-4 w-4" /></Button>
            </>}
            </div>
          </div>
        )}

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
        ) : visibleBoards.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <p className="text-muted-foreground">{query.trim() ? "No boards match your search." : "No boards in this folder yet. Move a board here from All boards."}</p>
            <Button variant="outline" className="mt-4" onClick={() => { setQuery(""); setFolder("all"); }}>Show all boards</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleBoards.map((board) => (
              <div key={board.id} className="group relative flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium"><Link href={`/app/boards/${board.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-primary">{board.title}</Link></h3>
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
                  {board.description && <p className="mt-1 truncate text-sm text-muted-foreground">{board.description}</p>}
                </div>
                <div className="relative z-10 flex flex-wrap items-center gap-1">
                  <select aria-label={`Folder for ${board.title}`} className={`${selectClass} max-w-40`} disabled={busy || !!folderError} value={organization.assignments[board.id] ?? ""} onChange={(event) => void organize({ type: "move", boardId: board.id, folderId: event.target.value || null })}>
                    <option value="">Unfiled</option>
                    {destinations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  {board.storageMode === "local" && signedIn && (
                    <Button variant="outline" size="sm" disabled={moving !== null} onClick={() => void handleMove(board.id)}>
                      {moving === board.id ? "Uploading..." : "Save to account"}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplicate ${board.title}`} onClick={() => handleDuplicate(board.id)}>
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
        <Dialog open={!!folderDialog} onOpenChange={(open) => { if (!open && !busy) setFolderDialog(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{folderDialog?.id ? "Rename folder" : "New folder"}</DialogTitle><DialogDescription>Organize boards in your personal folders.</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (folderDialog) void organize(folderDialog.id ? { type: "rename", id: folderDialog.id, name: folderDialog.name } : { type: "create", id: crypto.randomUUID(), name: folderDialog.name, parentId: folderDialog.parentId }); }}>
              <label htmlFor="folder-name" className="text-sm font-medium">Folder name</label>
              <Input id="folder-name" autoFocus required maxLength={80} disabled={busy} value={folderDialog?.name ?? ""} onChange={(event) => setFolderDialog((current) => current ? { ...current, name: event.target.value } : null)} />
              {!folderDialog?.id && <>
                <label htmlFor="new-folder-parent" className="text-sm font-medium">Create inside</label>
                <select id="new-folder-parent" className={`${selectClass} w-full`} disabled={busy} value={folderDialog?.parentId ?? ""} onChange={(event) => setFolderDialog((current) => current ? { ...current, parentId: event.target.value || null } : null)}>
                  <option value="">Top level</option>
                  {destinations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </>}
              <Button type="submit" disabled={busy || !folderDialog?.name.trim()}>{busy ? "Saving…" : "Save folder"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
