-- Manojalam — Supabase auth + user-owned boards
-- Copy-paste this whole file into the Supabase SQL Editor and run it.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled board',
  description text,
  content jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_snapshots (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content jsonb not null,
  snapshot_name text,
  created_at timestamptz not null default now()
);

create index if not exists boards_user_id_idx on public.boards(user_id);
create index if not exists boards_updated_at_idx on public.boards(updated_at desc);
create index if not exists board_snapshots_board_id_idx on public.board_snapshots(board_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_boards_updated_at on public.boards;
create trigger set_boards_updated_at
before update on public.boards
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_snapshots enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can view own boards" on public.boards;
create policy "Users can view own boards"
on public.boards
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own boards" on public.boards;
create policy "Users can create own boards"
on public.boards
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own boards" on public.boards;
create policy "Users can update own boards"
on public.boards
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own boards" on public.boards;
create policy "Users can delete own boards"
on public.boards
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view own snapshots" on public.board_snapshots;
create policy "Users can view own snapshots"
on public.board_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own snapshots" on public.board_snapshots;
create policy "Users can create own snapshots"
on public.board_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own snapshots" on public.board_snapshots;
create policy "Users can delete own snapshots"
on public.board_snapshots
for delete
to authenticated
using (auth.uid() = user_id);
