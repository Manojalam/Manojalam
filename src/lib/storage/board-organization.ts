import { getStorageUserId } from "./board-store";
import { requireSupabaseClient } from "../supabase/client";

export interface BoardFolder { id: string; name: string; parentId?: string | null }
export interface BoardOrganization {
  folders: BoardFolder[];
  assignments: Record<string, string>;
}

export function folderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error("Folder names must contain 1–80 characters.");
  return trimmed;
}

export function folderPath(folders: BoardFolder[], id: string): BoardFolder[] {
  const path: BoardFolder[] = [];
  const visited = new Set<string>();
  let folder = folders.find((item) => item.id === id);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    path.unshift(folder);
    folder = folders.find((item) => item.id === folder?.parentId);
  }
  return path;
}

export function canParentFolder(folders: BoardFolder[], id: string, parentId: string | null): boolean {
  return !parentId || (folders.some((folder) => folder.id === parentId)
    && !folderPath(folders, parentId).some((folder) => folder.id === id));
}

export function folderOptions(folders: BoardFolder[]): { id: string; label: string }[] {
  return folders.map((folder) => ({ id: folder.id, label: folderPath(folders, folder.id).map((item) => item.name).join(" / ") }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

// A separate database leaves the existing device-board store untouched.
async function localOrganization<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("manojalam-board-organization", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("organization");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not access folder storage."));
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("organization", mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(new Error("Could not save folders.")); };
    try { run(tx.objectStore("organization"), (result) => { value = result; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export async function readOrganization(userId: string | null): Promise<BoardOrganization> {
  if (!userId) return localOrganization("readonly", (store, done) => {
    const request = store.get("guest");
    request.onsuccess = () => done(request.result ?? { folders: [], assignments: {} });
  });
  const client = requireSupabaseClient();
  const [folders, assignments] = await Promise.all([
    client.from("board_folders").select("*").eq("user_id", userId).order("name"),
    client.from("board_folder_assignments").select("board_id, folder_id").eq("user_id", userId),
  ]);
  if (folders.error || assignments.error) throw new Error("Could not load folders. Make sure the board folders database migration has been applied.");
  return { folders: (folders.data ?? []).map((row) => ({ id: row.id, name: row.name, ...(row.parent_id !== undefined && { parentId: row.parent_id }) })), assignments: Object.fromEntries((assignments.data ?? []).map((row) => [row.board_id, row.folder_id])) };
}

export async function loadOrganization(): Promise<BoardOrganization> {
  return readOrganization(await getStorageUserId());
}

export type OrganizationAction =
  | { type: "create"; id: string; name: string; parentId?: string | null }
  | { type: "reparent"; id: string; parentId: string | null }
  | { type: "rename"; id: string; name: string }
  | { type: "delete"; id: string }
  | { type: "move"; boardId: string; folderId: string | null };

export function applyOrganizationAction(state: BoardOrganization, action: OrganizationAction): BoardOrganization {
  const next = structuredClone(state);
  if (action.type === "create") {
    if (!canParentFolder(next.folders, action.id, action.parentId ?? null)) throw new Error("Choose an existing parent folder outside this folder's descendants.");
    next.folders.push({ id: action.id, name: folderName(action.name), ...(action.parentId && { parentId: action.parentId }) });
  } else if (action.type === "reparent") {
    const folder = next.folders.find((folder) => folder.id === action.id);
    if (!folder) throw new Error("Folder no longer exists.");
    if (!canParentFolder(next.folders, action.id, action.parentId)) throw new Error("A folder cannot be moved into itself or one of its subfolders.");
    folder.parentId = action.parentId;
  }
  else if (action.type === "rename") {
    const folder = next.folders.find((folder) => folder.id === action.id);
    if (!folder) throw new Error("Folder no longer exists.");
    folder.name = folderName(action.name);
  } else if (action.type === "delete") {
    const parentId = next.folders.find((folder) => folder.id === action.id)?.parentId ?? null;
    for (const folder of next.folders) if (folder.parentId === action.id) folder.parentId = parentId;
    next.folders = next.folders.filter((folder) => folder.id !== action.id);
    for (const [id, folderId] of Object.entries(next.assignments)) if (folderId === action.id) delete next.assignments[id];
  } else {
    if (action.folderId && !next.folders.some((folder) => folder.id === action.folderId)) throw new Error("Folder no longer exists.");
    if (action.folderId) next.assignments[action.boardId] = action.folderId;
    else delete next.assignments[action.boardId];
  }
  return next;
}

export async function changeOrganization(action: OrganizationAction): Promise<void> {
  const userId = await getStorageUserId();
  if (!userId) return localOrganization("readwrite", (store, done) => {
    const request = store.get("guest");
    request.onsuccess = () => {
      try {
        store.put(applyOrganizationAction(request.result ?? { folders: [], assignments: {} }, action), "guest");
        done(undefined);
      } catch { request.transaction?.abort(); }
    };
  });
  const client = requireSupabaseClient();
  let result;
  if (action.type === "create") result = await client.from("board_folders").insert({ id: action.id, user_id: userId, name: folderName(action.name), ...(action.parentId && { parent_id: action.parentId }) });
  else if (action.type === "reparent") result = await client.from("board_folders").update({ parent_id: action.parentId }).eq("user_id", userId).eq("id", action.id).select("id").single();
  else if (action.type === "rename") result = await client.from("board_folders").update({ name: folderName(action.name) }).eq("user_id", userId).eq("id", action.id).select("id").single();
  else if (action.type === "delete") result = await client.from("board_folders").delete().eq("user_id", userId).eq("id", action.id);
  else if (action.folderId) result = await client.from("board_folder_assignments").upsert({ user_id: userId, board_id: action.boardId, folder_id: action.folderId }, { onConflict: "user_id,board_id" });
  else result = await client.from("board_folder_assignments").delete().eq("user_id", userId).eq("board_id", action.boardId);
  if (result.error) {
    if ("parentId" in action && /parent_id|schema cache/i.test(result.error.message)) throw new Error("Cloud subfolders need the nested folders database update (004_nested_board_folders.sql).");
    throw result.error;
  }
}
