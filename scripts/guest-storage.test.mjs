import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import ts from "typescript";

// Exercise the actual storage code, using IndexedDB and a controllable cloud boundary.
const require = createRequire(import.meta.url);
let user = null;
let configured = true;
let authError = null;
let uploadError = null;
let afterUpload = null;
let failRead = false;
const cloud = new Map();
const client = {
  auth: {
    getSession: async () => ({ data: { session: user ? { user } : null }, error: authError }),
    getUser: async () => ({ data: { user }, error: authError }),
  },
  from(table) {
    assert.equal(table, "boards");
    let id;
    let operation = "read";
    let payload;
    const query = {
      select() { return query; },
      eq(key, value) { if (key === "id") id = value; return query; },
      order() { return query; },
      insert(row) { operation = "insert"; payload = row; return query; },
      update(row) { operation = "update"; payload = row; return query; },
      async upsert(row, options) {
        assert.deepEqual(options, { onConflict: "id", ignoreDuplicates: true });
        if (uploadError) return { error: uploadError };
        if (!cloud.has(row.id)) cloud.set(row.id, JSON.parse(JSON.stringify({ ...row, updated_at: new Date().toISOString(), thumbnail_url: null })));
        if (afterUpload) await afterUpload();
        return { error: null };
      },
      async maybeSingle() {
        if (failRead) return { data: null, error: new Error("network interrupted") };
        if (operation === "update") cloud.set(id, { ...cloud.get(id), ...payload });
        const row = cloud.get(id);
        return { data: row?.user_id === user?.id ? row : null, error: null };
      },
      async single() {
        assert.equal(operation, "insert");
        const row = { ...payload, id: crypto.randomUUID(), updated_at: new Date().toISOString(), created_at: new Date().toISOString(), description: null, thumbnail_url: null };
        cloud.set(row.id, row);
        return { data: row, error: null };
      },
      then(done, reject) { return Promise.resolve({ data: [...cloud.values()].filter(row => row.user_id === user?.id), error: null }).then(done, reject); },
    };
    return query;
  },
};
const cache = new Map();
function load(path) {
  if (path.endsWith("/supabase/client.ts")) return { createClient: () => configured ? client : null, requireSupabaseClient: () => client };
  if (cache.has(path)) return cache.get(path).exports;
  const loadedModule = { exports: {} };
  cache.set(path, loadedModule);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return require(specifier);
    const base = specifier.startsWith("@/") ? resolve("src", specifier.slice(2)) : resolve(dirname(path), specifier);
    const file = existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`;
    return load(file.replaceAll("\\", "/"));
  };
  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const boards = load(resolve("src/lib/storage/board-store.ts").replaceAll("\\", "/"));
const local = load(resolve("src/lib/storage/local-boards.ts").replaceAll("\\", "/"));
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  user = null; configured = true; authError = null; uploadError = null; afterUpload = null; failRead = false; cloud.clear();
});

test("guest create, rename, save, reopen, export, import, duplicate and delete", async () => {
  const board = await boards.createBoard(undefined, "Guest work");
  assert.equal(board.storageMode, "local");
  assert.equal(board.userId, null);
  const content = structuredClone(board.content);
  content.nodes[0].data.text = "Persisted edit";
  await boards.updateBoard(board.id, { title: "Renamed", content });
  assert.equal((await boards.getBoard(board.id)).content.nodes[0].data.text, "Persisted edit");
  const copy = await boards.duplicateBoard(board.id);
  assert.notEqual(copy.id, board.id);
  const imported = await boards.importBoard(await boards.exportBoard(board.id));
  assert.equal(imported.title, "Renamed");
  assert.equal((await boards.listBoards()).length, 3);
  await boards.deleteBoard(board.id);
  assert.equal(await boards.getBoard(board.id), null);
  assert.equal(await boards.updateBoard(board.id, { title: "must not resurrect" }), null);
  assert.equal(cloud.size, 0);
});

test("guest template content is persisted", async () => {
  const templates = load(resolve("src/lib/templates/index.ts").replaceAll("\\", "/"));
  const template = templates.getAllTemplates()[0];
  assert.ok(template, "template catalog is available");
  const board = await boards.createBoard(template.id);
  assert.ok(board.content.nodes.length > 0);
  assert.deepEqual((await boards.getBoard(board.id)).content, board.content);
});

test("signed-in users see local boards and create new boards in the cloud", async () => {
  const guest = await boards.createBoard();
  user = { id: "account-a" };
  const remote = await boards.createBoard(undefined, "Cloud work");
  assert.equal(remote.storageMode, "supabase");
  assert.equal((await boards.listBoards()).length, 2);
  assert.equal((await boards.getBoard(guest.id)).storageMode, "local");
  await boards.updateBoard(guest.id, { title: "Still local" });
  assert.equal(cloud.size, 1);
});

test("authentication failures do not fall back to guest writes", async () => {
  user = { id: "account-a" }; authError = new Error("offline");
  await assert.rejects(boards.createBoard(), /offline/);
  assert.equal((await local.listLocalBoards()).length, 0);
});

test("verified upload removes local copy and preserves complete content", async () => {
  const board = await boards.createBoard(undefined, "Transfer me");
  user = { id: "account-a" };
  const saved = await boards.moveGuestBoardToAccount(board.id);
  assert.equal(saved.title, board.title);
  assert.deepEqual(saved.content, board.content);
  assert.equal(saved.userId, user.id);
  assert.equal(await local.getLocalBoard(board.id), null);
});

test("failed upload keeps the device board", async () => {
  const board = await boards.createBoard();
  user = { id: "account-a" }; uploadError = new Error("upload unavailable");
  await assert.rejects(boards.moveGuestBoardToAccount(board.id), /upload unavailable/);
  assert.ok(await local.getLocalBoard(board.id));
});

test("interrupted verification can retry without creating a second cloud board", async () => {
  const board = await boards.createBoard();
  user = { id: "account-a" }; failRead = true;
  await assert.rejects(boards.moveGuestBoardToAccount(board.id));
  assert.ok(await local.getLocalBoard(board.id));
  failRead = false;
  await boards.moveGuestBoardToAccount(board.id);
  assert.equal(cloud.size, 1);
  assert.equal(await local.getLocalBoard(board.id), null);
});

test("another account cannot claim a previously uploaded device board", async () => {
  const board = await boards.createBoard();
  user = { id: "account-a" }; failRead = true;
  await assert.rejects(boards.moveGuestBoardToAccount(board.id));
  user = { id: "account-b" }; failRead = false;
  await assert.rejects(boards.moveGuestBoardToAccount(board.id), /device copy is safe/);
  assert.ok(await local.getLocalBoard(board.id));
  assert.equal([...cloud.values()][0].user_id, "account-a");
});

test("edits in another tab during upload are retained locally", async () => {
  const board = await boards.createBoard();
  user = { id: "account-a" };
  afterUpload = () => boards.updateBoard(board.id, { title: "Newer edit" });
  await assert.rejects(boards.moveGuestBoardToAccount(board.id), /changed during upload/);
  assert.equal((await local.getLocalBoard(board.id)).title, "Newer edit");
});

test("storage failure rejects the write and preserves the previous board", async () => {
  const board = await boards.createBoard();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { this.transaction.abort(); throw new DOMException("Full", "QuotaExceededError"); };
  try { await assert.rejects(boards.updateBoard(board.id, { title: "Unsaved change" })); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.equal((await boards.getBoard(board.id)).title, board.title);
});


test("guest storage works with no cloud configuration", async () => {
  configured = false;
  const board = await boards.createBoard(undefined, "No backend");
  assert.equal((await boards.getBoard(board.id)).title, "No backend");
  assert.equal((await boards.listBoards()).length, 1);
});

test("guests cannot load cloud boards or upload to an account", async () => {
  const board = await boards.createBoard();
  await assert.rejects(boards.getBoard(crypto.randomUUID()), /signed in/);
  await assert.rejects(boards.moveGuestBoardToAccount(board.id), /signed in/);
  assert.ok(await local.getLocalBoard(board.id));
});

test("unavailable browser storage reports an actionable error", async () => {
  globalThis.indexedDB = undefined;
  await assert.rejects(boards.createBoard(), /Browser storage is unavailable/);
});
