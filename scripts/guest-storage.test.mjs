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
const assets = new Map();
let assetUploads = 0;
let activeDownloads = 0, maxDownloads = 0, downloadCount = 0, downloadDelay = 0;
let failAssetAfter = Infinity;
let listColumns;
globalThis.FileReader = class {
  readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload(); }).catch(() => this.onerror()); }
};
const client = {
  storage: { from(bucket) {
    assert.equal(bucket, "board-images");
    return {
      async upload(path, blob) {
        if (assetUploads >= failAssetAfter) return { error: { message: "Upload unavailable", statusCode: "503" } };
        if (assets.has(path)) return { error: { message: "The resource already exists", statusCode: "409" } };
        assets.set(path, blob); assetUploads++; return { error: null };
      },
      async download(path) {
        downloadCount++; activeDownloads++; maxDownloads = Math.max(maxDownloads, activeDownloads);
        try {
          if (downloadDelay) await new Promise(resolve => setTimeout(resolve, downloadDelay));
          return assets.has(path) ? { data: assets.get(path), error: null } : { data: null, error: new Error("Image not found") };
        } finally { activeDownloads--; }
      },
    };
  } },
  auth: {
    getSession: async () => ({ data: { session: user ? { user } : null }, error: authError }),
    getUser: async () => ({ data: { user }, error: authError }),
  },
  from(table) {
    assert.equal(table, "boards");
    let id;
    let operation = "read";
    let payload;
    let columns = "*";
    const query = {
      select(value = "*") { columns = value; return query; },
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
      then(done, reject) { listColumns = columns; return Promise.resolve({ data: [...cloud.values()].filter(row => row.user_id === user?.id).map(row => columns === "*" ? row : Object.fromEntries(columns.split(",").map(key => [key, row[key]]))), error: null }).then(done, reject); },
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
  user = null; configured = true; authError = null; uploadError = null; afterUpload = null; failRead = false; cloud.clear(); assets.clear(); assetUploads = 0; failAssetAfter = Infinity; activeDownloads = 0; maxDownloads = 0; downloadCount = 0; downloadDelay = 0;
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

const recovery = load(resolve("src/lib/storage/board-backup.ts").replaceAll("\\", "/"));
function imageContent(board, count, bytes = 1024) {
  return { ...board.content, nodes: Array.from({ length: count }, (_, i) => ({
    id: `image-${i}`, type: "image", position: { x: 0, y: i * 400 },
    data: { image: { id: `asset-${i}`, kind: "image", name: `Slide ${i}.png`, mimeType: "image/png",
      dataUrl: `data:image/png;base64,${Buffer.concat([Buffer.from(String(i)), Buffer.alloc(bytes, i % 256)]).toString("base64")}`,
      size: bytes, createdAt: new Date().toISOString(), width: 640, height: 360 } },
  })) };
}
test("140 large images: small cloud board, one upload per asset, lossless reload and portable export", async () => {
  user = { id: "large-images-user" };
  const board = await boards.createBoard(undefined, "140 slides");
  const content = imageContent(board, 140, 256 * 1024);
  const key = recovery.backupKey(user.id, board.id);
  const backup = await recovery.writeBoardBackup(key, { ...board, content });
  await boards.updateBoard(board.id, { content });
  assert.equal(assetUploads, 140);
  assert.ok(JSON.stringify(content).length > 45_000_000);
  const cloudBytes = JSON.stringify(cloud.get(board.id).content).length;
  assert.ok(cloudBytes < 100_000, `Cloud payload ${cloudBytes}`);
  await boards.updateBoard(board.id, { content });
  assert.equal(assetUploads, 140, "unchanged images are not uploaded again");
  const reopened = await boards.getBoard(board.id);
  assert.equal(reopened.content.nodes.length, 140);
  for (let i = 0; i < 140; i++) assert.equal(reopened.content.nodes[i].data.image.dataUrl, content.nodes[i].data.image.dataUrl);
  assert.ok((await boards.exportBoard(board.id)).includes("data:image/png;base64,"));
  assert.equal((await recovery.readBoardBackup(key)).board.content.nodes.length, 140);
  await recovery.acknowledgeBoardBackup(key, backup.revision);
  assert.equal((await recovery.readBoardBackup(key)).pending, false);
});
test("interrupted image upload retains old cloud board and local draft; retry resumes safely", async () => {
  user = { id: "retry-user" };
  const board = await boards.createBoard();
  const content = imageContent(board, 10);
  const key = recovery.backupKey(user.id, board.id);
  await recovery.writeBoardBackup(key, { ...board, content });
  failAssetAfter = 4;
  await assert.rejects(boards.updateBoard(board.id, { content }), { message: "Upload unavailable" });
  assert.equal(cloud.get(board.id).content.nodes.length, 1);
  assert.equal((await recovery.readBoardBackup(key)).pending, true);
  assert.equal((await recovery.readBoardBackup(key)).board.content.nodes.length, 10);
  failAssetAfter = Infinity;
  await boards.updateBoard(board.id, { content });
  assert.equal(assetUploads, 10);
  assert.equal((await boards.getBoard(board.id)).content.nodes.length, 10);
});
test("old save acknowledgements cannot clear new edits; backups are account scoped", async () => {
  const board = await boards.createBoard();
  const key = recovery.backupKey("one", board.id);
  const first = await recovery.writeBoardBackup(key, board);
  await recovery.writeBoardBackup(key, { ...board, title: "New edits" });
  await recovery.acknowledgeBoardBackup(key, first.revision);
  assert.equal((await recovery.readBoardBackup(key)).pending, true);
  assert.equal((await recovery.readBoardBackup(key)).board.title, "New edits");
  assert.equal(await recovery.readBoardBackup(recovery.backupKey("two", board.id)), null);
});
test("local backup transaction failure is reported, not acknowledged", async () => {
  const board = await boards.createBoard();
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
  try { await assert.rejects(recovery.writeBoardBackup("quota", board), /Quota exceeded/); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal(await recovery.readBoardBackup("quota"), null);
  assert.equal(recovery.saveErrorMessage({ message: "Request too large", code: "413", hint: "Retry" }), "Request too large · Retry · (413)");
});

test("cloud imports and guest uploads also separate images; attachments survive cross-board copy", async () => {
  const guest = await boards.createBoard();
  const content = imageContent(guest, 3);
  content.nodes.push({ id: "box", type: "shape", position: { x: 700, y: 0 }, data: { shapeType: "rounded", text: "Attached", mediaAttachments: [content.nodes[0].data.image] } });
  await boards.updateBoard(guest.id, { content });
  user = { id: "import-user" };
  const moved = await boards.moveGuestBoardToAccount(guest.id);
  assert.equal(assetUploads, 3, "duplicate attachment shares a board asset");
  assert.ok(!JSON.stringify(cloud.get(moved.id).content).includes("data:image/"));
  assert.ok(moved.content.nodes[3].data.mediaAttachments[0].dataUrl.startsWith("data:image/"));
  const imported = await boards.createBoardFromContent("Imported", moved.content);
  assert.ok(!JSON.stringify(cloud.get(imported.id).content).includes("data:image/"));
  assert.equal((await boards.getBoard(imported.id)).content.nodes[0].data.image.dataUrl, content.nodes[0].data.image.dataUrl);
  assert.equal(assetUploads, 6, "copied board has its own authorized assets");
});

test("cloud reload downloads concurrently with a six-request limit", async () => {
  user = { id: "parallel-reader" };
  const board = await boards.createBoard();
  const content = imageContent(board, 20);
  await boards.updateBoard(board.id, { content });
  downloadDelay = 10;
  const loaded = await boards.getBoard(board.id);
  assert.equal(loaded.content.nodes.length, 20);
  assert.equal(downloadCount, 20);
  assert.equal(maxDownloads, 6);
});
test("reload reuses only hash-matching images from the local backup", async () => {
  user = { id: "cached-reader" };
  const board = await boards.createBoard();
  const content = imageContent(board, 20);
  await boards.updateBoard(board.id, { content });
  const stale = structuredClone(content);
  stale.nodes[0].data.image.dataUrl = "data:image/png;base64,c3RhbGU=";
  await recovery.writeBoardBackup(recovery.backupKey(user.id, board.id), { ...board, content: stale });
  const loaded = await boards.getBoard(board.id);
  assert.equal(downloadCount, 1, "only the changed image downloads");
  assert.equal(loaded.content.nodes[0].data.image.dataUrl, content.nodes[0].data.image.dataUrl);
});
test("a stalled load times out instead of leaving an endless spinner", async () => {
  const { withLoadTimeout } = load(resolve("src/lib/storage/load-timeout.ts").replaceAll("\\", "/"));
  await assert.rejects(withLoadTimeout(new Promise(() => {}), 10, "Image timed out"), /Image timed out/);
  assert.equal(await withLoadTimeout(Promise.resolve("loaded"), 10, "timeout"), "loaded");
});


test("listing hundreds of image references needs no image downloads or board content", async () => {
 user = { id: crypto.randomUUID() };
 const board = await boards.createBoard(undefined,"Large image board");
 const row=cloud.get(board.id);
 row.content.nodes=Array.from({length:300},(_,i)=>({id:String(i),type:"image",position:{x:0,y:i*200},data:{src:`board-image:${board.id}/${i.toString(16).padStart(64,"0")}`}}));
 // All assets are unavailable: listing must still succeed, with no download attempts.
 const summaries=await boards.listBoardSummaries();
 assert.equal(summaries.length,1);assert.equal(summaries[0].title,"Large image board");
 assert.equal(summaries[0].accessRole,"owner");
 assert.equal("content" in summaries[0],false);assert.equal(downloadCount,0);
 assert.ok(!listColumns.includes("content") && !listColumns.includes("*"), "list query must not transfer board content");
 await assert.rejects(boards.getBoard(board.id),/Image not found/);
 assert.ok(downloadCount>0,"opening the chosen board still resolves images");
});

test("device summaries retain titles and counts without exposing content", async()=>{
 const board=await boards.createBoard(undefined,"Local board");
 const [summary]=await boards.listBoardSummaries();
 assert.equal(summary.id,board.id);assert.equal(summary.nodeCount,board.content.nodes.length);
 assert.equal("content" in summary,false);
});
