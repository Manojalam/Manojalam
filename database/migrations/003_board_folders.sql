-- Personal organization: never changes board ownership or collaborator access.
create table if not exists public.board_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  unique (user_id, id)
);

-- Text IDs also allow signed-in users to organize their device boards.
create table if not exists public.board_folder_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id text not null,
  folder_id uuid not null,
  primary key (user_id, board_id),
  foreign key (user_id, folder_id) references public.board_folders(user_id, id) on delete cascade
);
create index if not exists board_folder_assignments_folder_idx on public.board_folder_assignments(user_id, folder_id);

alter table public.board_folders enable row level security;
alter table public.board_folder_assignments enable row level security;
revoke all on public.board_folders, public.board_folder_assignments from anon;
grant select, insert, update, delete on public.board_folders, public.board_folder_assignments to authenticated;

drop policy if exists "Personal folders" on public.board_folders;
create policy "Personal folders" on public.board_folders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Personal folder assignments" on public.board_folder_assignments;
create policy "Personal folder assignments" on public.board_folder_assignments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
