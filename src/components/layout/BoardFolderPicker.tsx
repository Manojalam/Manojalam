"use client";

import { useRef, useState } from "react";
import { changeOrganization, folderOptions, type BoardOrganization } from "@/lib/storage/board-organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function BoardFolderPicker({ organization, value, onChange, onCreated, disabled, label }: {
  organization: BoardOrganization; value: string;
  onChange: (id: string) => void | Promise<void>;
  onCreated: () => void | Promise<void>; disabled?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const created = useRef<string | null>(null);
  const options = folderOptions(organization.folders);
  const choose = async (id: string) => {
    setBusy(true);
    try { await onChange(id); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not move board. Please retry."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-1">
    <select aria-label={label} className="h-9 w-full max-w-64 rounded-md border bg-background px-3 text-sm" disabled={disabled || busy} value={value} onChange={event => {
      if (event.target.value === "$new") { created.current = null; setName(""); setParent(value); setError(""); setOpen(true); }
      else void choose(event.target.value);
    }}>
      <option value="">Unfiled</option>
      {options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      <option value="$new">＋ New folder…</option>
    </select>
    {error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New folder</DialogTitle><DialogDescription>Create a destination folder and use it for this board.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault(); if (busy) return; setBusy(true); setError("");
          try {
            if (!created.current) {
              const id = crypto.randomUUID();
              await changeOrganization({ type: "create", id, name, parentId: parent || null });
              created.current = id;
            }
            await onCreated();
            await onChange(created.current);
            setOpen(false);
          } catch (error) { setError(error instanceof Error ? error.message : "Could not save folder. Please retry."); }
          finally { setBusy(false); }
        }}>
          <label className="block text-sm">Folder name<Input autoFocus required maxLength={80} value={name} disabled={busy || !!created.current} onChange={event => setName(event.target.value)} /></label>
          <label className="block text-sm">Create inside<select className="mt-1 h-9 w-full rounded-md border bg-background px-3" value={parent} disabled={busy || !!created.current} onChange={event => setParent(event.target.value)}>
            <option value="">Top level</option>{options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          {error && <p role="alert" className="text-sm text-destructive">{created.current ? "Folder created, but it could not be selected or the board could not be moved. " : ""}{error}</p>}
          <Button disabled={busy || !name.trim()} type="submit">{busy ? "Saving…" : created.current ? "Retry" : "Create and use folder"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
