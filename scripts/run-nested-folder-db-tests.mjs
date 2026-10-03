import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Install the isolated test engine with:
// npm install --prefix .tmp/nested-folder-db --no-audit --no-fund @electric-sql/pglite
const require = createRequire(path.resolve(".tmp/nested-folder-db/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const user = "10000000-0000-0000-0000-000000000001";
const other = "10000000-0000-0000-0000-000000000002";
const root = "20000000-0000-0000-0000-000000000001";
const child = "20000000-0000-0000-0000-000000000002";
const leaf = "20000000-0000-0000-0000-000000000003";
const foreign = "20000000-0000-0000-0000-000000000004";
try {
  await db.exec(`create schema auth;
    create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${user}'), ('${other}');
    create table public.boards(id text primary key, content jsonb);
    insert into public.boards values ('keep-me', '{"nodes":[{"text":"Original board"}]}');`);
  await db.exec(readFileSync("database/migrations/003_board_folders.sql", "utf8"));
  await db.query("insert into board_folders(id,user_id,name) values ($1,$2,'Existing root'),($3,$4,'Other account')", [root, user, foreign, other]);
  const migration = readFileSync("database/migrations/004_nested_board_folders.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // Repeatability matters for SQL Editor retries.
  assert.equal((await db.query("select parent_id from board_folders where id=$1", [root])).rows[0].parent_id, null);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  await db.query("insert into board_folders(id,user_id,name,parent_id) values ($1,$2,'Child',$3)", [child, user, root]);
  await db.query("insert into board_folders(id,user_id,name,parent_id) values ($1,$2,'Leaf',$3)", [leaf, user, child]);
  await db.query("insert into board_folder_assignments(user_id,board_id,folder_id) values ($1,'nested-board',$2),($1,'direct-board',$3)", [user, leaf, child]);
  await assert.rejects(db.query("update board_folders set parent_id=$1 where id=$2", [leaf, root]), /subfolders/);
  await assert.rejects(db.query("update board_folders set parent_id=id where id=$1", [child]), /subfolders/);
  await assert.rejects(db.query("update board_folders set parent_id=$1 where id=$2", [foreign, child]), /foreign key/);
  assert.equal((await db.query("select id from board_folders where id=$1", [foreign])).rows.length, 0);
  await db.query("delete from board_folders where id=$1", [child]);
  assert.equal((await db.query("select parent_id from board_folders where id=$1", [leaf])).rows[0].parent_id, root);
  assert.deepEqual((await db.query("select board_id,folder_id from board_folder_assignments")).rows, [{ board_id: "nested-board", folder_id: leaf }]);
  await db.query("delete from board_folders where id=$1", [root]);
  assert.equal((await db.query("select parent_id from board_folders where id=$1", [leaf])).rows[0].parent_id, null);
  await db.exec("reset role;");
  assert.deepEqual((await db.query("select content from boards where id='keep-me'")).rows[0].content, { nodes: [{ text: "Original board" }] });
  console.log("PASS: migration retries, existing folders, nesting, cycle rejection, account isolation, child promotion and unchanged board content.");
} finally { await db.close(); }
