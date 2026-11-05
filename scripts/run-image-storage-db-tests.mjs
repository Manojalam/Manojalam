import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
// Isolated dependency: npm install --prefix .tmp/image-storage-db @electric-sql/pglite
const require = createRequire(path.resolve(".tmp/image-storage-db/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const board = "20000000-0000-0000-0000-000000000001";
const asset = `${board}/${"a".repeat(64)}`;
try {
  await db.exec(`create schema storage; create schema auth; create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select '10000000-0000-0000-0000-000000000001'::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.boards(id uuid primary key, user_id uuid);
    insert into public.boards values ('${board}', '10000000-0000-0000-0000-000000000001');
    alter table public.boards enable row level security;
    grant select on public.boards to authenticated;
    create policy read_boards on public.boards for select to authenticated using (current_setting('test.role',true) in ('owner','editor','viewer'));
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(bucket_id text, name text, primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
`);
  const migration = readFileSync("database/migrations/005_board_images.sql", "utf8");
  await db.exec(migration); await db.exec(migration);
  assert.equal((await db.query("select public from storage.buckets where id='board-images'")).rows[0].public, false);
  await db.exec("set role authenticated; select set_config('test.role','owner',false)");
  await db.query("insert into storage.objects values ('board-images',$1)", [asset]);
  // Install collaborators only after verifying owner-only migration worked.
  await db.exec("reset role");
  await db.exec(`update public.boards set user_id='10000000-0000-0000-0000-000000000002';
    create table public.board_collaborators(board_id uuid,user_id uuid,role text);
    insert into public.board_collaborators values ('${board}',auth.uid(),'viewer');
    grant select on public.board_collaborators to authenticated;`);
  await db.exec("set role authenticated; select set_config('test.role','viewer',false)");
  assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
  await assert.rejects(db.query("insert into storage.objects values ('board-images',$1)", [asset + "b"]), /row-level security/);
  await db.exec("reset role; update public.board_collaborators set role='editor'; set role authenticated; select set_config('test.role','editor',false)");
  await db.query("insert into storage.objects values ('board-images',$1)", [asset + "b"]);
  await db.exec("select set_config('test.role','',false)");
  assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
  await assert.rejects(db.query("insert into storage.objects values ('board-images',$1)", [asset + "c"]), /row-level security/);
  console.log("PASS: private bucket, repeatable migration, member reads, editor uploads, viewer/nonmember denial.");
} finally { await db.close(); }
