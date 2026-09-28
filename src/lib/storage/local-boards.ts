import type { VidyaBoard } from "../types";

const DATABASE = "manojalam-guest-boards";
const STORE = "boards";
export const isLocalBoardId = (id: string) => id.startsWith("guest-");

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage is unavailable. Use a browser that allows site storage."));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Browser storage is unavailable. Download a backup before leaving."));
  });
}

// Resolve only after commit: request success alone does not mean a write was saved.
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => {
      db.close();
      reject(new Error("Could not save or read browser storage. Download a backup before leaving."));
    };
    try { run(tx.objectStore(STORE), (value) => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export function listLocalBoards(): Promise<VidyaBoard[]> {
  return transaction("readonly", (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => done(request.result as VidyaBoard[]);
  });
}

export function getLocalBoard(id: string): Promise<VidyaBoard | null> {
  return transaction("readonly", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result ?? null);
  });
}

export function addLocalBoard(board: VidyaBoard): Promise<VidyaBoard> {
  return transaction("readwrite", (store, done) => { store.add(board); done(board); });
}

export function updateLocalBoard(id: string, partial: Partial<Pick<VidyaBoard, "title" | "description" | "content">>): Promise<VidyaBoard | null> {
  return transaction("readwrite", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) { done(null); return; }
      const board = { ...request.result, ...partial, updatedAt: new Date().toISOString() } as VidyaBoard;
      store.put(board);
      done(board);
    };
  });
}

export function deleteLocalBoard(id: string, expected?: VidyaBoard): Promise<boolean> {
  return transaction("readwrite", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => {
      // Keep edits made in another tab while an upload was in flight.
      if (expected && JSON.stringify(request.result) !== JSON.stringify(expected)) { done(false); return; }
      store.delete(id);
      done(true);
    };
  });
}
