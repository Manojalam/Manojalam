-- Manashchitram initial schema
-- Run this in Supabase SQL Editor after creating your project

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Boards
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  content jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  is_archived boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists boards_user_id_idx on public.boards(user_id);
create index if not exists boards_updated_at_idx on public.boards(updated_at desc);

-- Board snapshots
create table if not exists public.board_snapshots (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  content jsonb not null,
  snapshot_name text,
  created_at timestamptz default now() not null
);

create index if not exists board_snapshots_board_id_idx on public.board_snapshots(board_id);

-- Assets
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now() not null
);

create index if not exists assets_board_id_idx on public.assets(board_id);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_snapshots enable row level security;
alter table public.assets enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Boards policies
create policy "Users can view own boards"
  on public.boards for select
  using (auth.uid() = user_id);

create policy "Users can insert own boards"
  on public.boards for insert
  with check (auth.uid() = user_id);

create policy "Users can update own boards"
  on public.boards for update
  using (auth.uid() = user_id);

create policy "Users can delete own boards"
  on public.boards for delete
  using (auth.uid() = user_id);

-- Snapshots policies
create policy "Users can view own snapshots"
  on public.board_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert own snapshots"
  on public.board_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own snapshots"
  on public.board_snapshots for delete
  using (auth.uid() = user_id);

-- Assets policies
create policy "Users can view own assets"
  on public.assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own assets"
  on public.assets for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own assets"
  on public.assets for delete
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket suggestion (run in Storage section or via API):
-- Create bucket: board-assets (private)
-- Policy: users can upload/read/delete only their own files under {user_id}/
