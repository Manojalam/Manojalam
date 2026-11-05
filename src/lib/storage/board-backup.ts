import type { VidyaBoard } from "../types";

export interface BoardBackup {
  id: string;
  revision: string;
  savedAt: string;
  pending: boolean;
  board: VidyaBoard;
}
const DATABASE = "manojalam-board-recovery";
async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backups", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("backups", mode);
    let result: T;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Local backup could not be saved.")); };
    try { run(tx.objectStore("backups"), value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}
export function backupKey(userId: string | null, boardId: string): string {
  return `${userId ?? "guest"}:${boardId}`;
}
export function readBoardBackup(id: string): Promise<BoardBackup | null> {
  return transact("readonly", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result ?? null);
  });
}
export function writeBoardBackup(id: string, board: VidyaBoard): Promise<BoardBackup> {
  const backup: BoardBackup = { id, board, pending: true, revision: crypto.randomUUID(), savedAt: new Date().toISOString() };
  return transact("readwrite", (store, done) => { store.put(backup); done(backup); });
}
export function acknowledgeBoardBackup(id: string, revision: string): Promise<void> {
  return transact("readwrite", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const backup = request.result as BoardBackup | undefined;
      // A completed old upload must never acknowledge newer edits or another tab.
      if (backup?.revision === revision) store.put({ ...backup, pending: false });
      done(undefined);
    };
  });
}
export function saveErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const detail = error as { message?: string; details?: string; hint?: string; code?: string };
    return [detail.message, detail.details, detail.hint, detail.code && `(${detail.code})`].filter(Boolean).join(" · ") || "Unknown save error.";
  }
  return String(error || "Unknown save error.");
}
