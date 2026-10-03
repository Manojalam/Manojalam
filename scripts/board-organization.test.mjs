import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { IDBFactory } from "fake-indexeddb";

function load(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected runtime dependency: ${name}`);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
let userId = null;
let authError = null;
const organization = load("src/lib/storage/board-organization.ts", {
  "./board-store": { getStorageUserId: async () => { if (authError) throw authError; return userId; } },
  "../supabase/client": { requireSupabaseClient: () => { throw new Error("Cloud storage unavailable"); } },
});
const { filterBoards } = load("src/lib/storage/board-list.ts");
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); userId = null; authError = null; });

test("device folders persist, rename, move and delete without touching boards", async () => {
  await organization.changeOrganization({ type: "create", id: "f1", name: "  Studies  " });
  await organization.changeOrganization({ type: "move", boardId: "guest-a", folderId: "f1" });
  await organization.changeOrganization({ type: "rename", id: "f1", name: "Reading" });
  assert.deepEqual(await organization.loadOrganization(), { folders: [{ id: "f1", name: "Reading" }], assignments: { "guest-a": "f1" } });
  await organization.changeOrganization({ type: "delete", id: "f1" });
  assert.deepEqual(await organization.loadOrganization(), { folders: [], assignments: {} });
});

test("concurrent device mutations preserve independent changes", async () => {
  await Promise.all(["f1", "f2"].map((id) => organization.changeOrganization({ type: "create", id, name: id })));
  assert.equal((await organization.loadOrganization()).folders.length, 2);
  await assert.rejects(organization.changeOrganization({ type: "move", boardId: "a", folderId: "missing" }));
  assert.equal((await organization.loadOrganization()).folders.length, 2);
});

test("invalid names and authentication errors never silently save to device", async () => {
  assert.throws(() => organization.folderName("   "));
  assert.throws(() => organization.folderName("a".repeat(81)));
  authError = new Error("Session expired");
  await assert.rejects(organization.changeOrganization({ type: "create", id: "f1", name: "Cloud" }), /Session expired/);
  authError = null;
  userId = "account";
  await assert.rejects(organization.loadOrganization(), /Cloud storage unavailable/);
  userId = null;
  assert.deepEqual(await organization.loadOrganization(), { folders: [], assignments: {} });
});

test("search, folder filters and every sort compose without mutating the input", () => {
  const boards = [
    { id: "b", title: "Beta", description: "Sanskrit notes", updatedAt: "2026-02-01", createdAt: "2026-01-01" },
    { id: "a", title: "Alpha", description: null, updatedAt: "2026-01-01", createdAt: "2026-02-01" },
    { id: "c", title: "Gamma", updatedAt: "2026-03-01", createdAt: "2026-03-01" },
  ];
  const state = { folders: [{ id: "f1", name: "Studies" }], assignments: { b: "f1", c: "deleted" } };
  const ids = (folder, query, sort) => filterBoards(boards, state, folder, query, sort).map((board) => board.id);
  assert.deepEqual(ids("f1", " SANSKRIT ", "updated"), ["b"]);
  assert.deepEqual(ids("unfiled", "", "title-asc"), ["a", "c"]);
  assert.deepEqual(ids("all", "", "updated"), ["c", "b", "a"]);
  assert.deepEqual(ids("all", "", "created"), ["c", "a", "b"]);
  assert.deepEqual(ids("all", "", "title-desc"), ["c", "b", "a"]);
  assert.deepEqual(ids("all", "no match", "updated"), []);
  assert.deepEqual(boards.map((board) => board.id), ["b", "a", "c"]);
});

test("cloud reads and mutations use personal tables and account scope", async () => {
  const calls = [];
  let cloudError = null;
  const client = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const result = { data: table === "board_folders" ? [{ id: "f1", name: "Cloud" }] : [{ board_id: "shared-board", folder_id: "f1" }], error: cloudError };
      const query = {
        select() { return query; }, order() { return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        insert(payload) { call.payload = payload; call.operation = "insert"; return query; },
        update(payload) { call.payload = payload; call.operation = "update"; return query; },
        upsert(payload, options) { call.payload = payload; call.options = options; call.operation = "upsert"; return query; },
        delete() { call.operation = "delete"; return query; },
        single() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  };
  const storage = load("src/lib/storage/board-organization.ts", {
    "./board-store": { getStorageUserId: async () => "account-a" },
    "../supabase/client": { requireSupabaseClient: () => client },
  });
  assert.deepEqual(await storage.loadOrganization(), { folders: [{ id: "f1", name: "Cloud" }], assignments: { "shared-board": "f1" } });
  assert.ok(calls.every((call) => call.filters.some(([key, value]) => key === "user_id" && value === "account-a")));
  await storage.changeOrganization({ type: "create", id: "f2", name: " New " });
  assert.deepEqual(calls.at(-1).payload, { id: "f2", name: "New", user_id: "account-a" });
  await storage.changeOrganization({ type: "move", boardId: "shared-board", folderId: "f2" });
  assert.deepEqual(calls.at(-1).payload, { user_id: "account-a", board_id: "shared-board", folder_id: "f2" });
  assert.deepEqual(calls.at(-1).options, { onConflict: "user_id,board_id" });
  await storage.changeOrganization({ type: "rename", id: "f2", name: "Renamed" });
  await storage.changeOrganization({ type: "delete", id: "f2" });
  await storage.changeOrganization({ type: "move", boardId: "shared-board", folderId: null });
  assert.ok(calls.slice(-3).every((call) => call.filters.some(([key, value]) => key === "user_id" && value === "account-a")));
  assert.ok(calls.every((call) => call.table !== "boards"));
  cloudError = new Error("Access denied");
  await assert.rejects(storage.changeOrganization({ type: "create", id: "bad", name: "Denied" }), /Access denied/);
});
