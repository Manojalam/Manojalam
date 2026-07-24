-- Manojalam — secure board collaboration
-- Run after 001_supabase_auth_boards.sql.

alter table public.profiles
add column if not exists avatar_url text;

alter table public.boards
add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function public.set_board_updated_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists set_board_updated_by on public.boards;
create trigger set_board_updated_by
before update on public.boards
for each row
execute function public.set_board_updated_by();

create table if not exists public.board_collaborators (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists board_collaborators_user_id_idx
on public.board_collaborators(user_id);

drop trigger if exists set_board_collaborators_updated_at on public.board_collaborators;
create trigger set_board_collaborators_updated_at
before update on public.board_collaborators
for each row
execute function public.set_updated_at();

alter table public.board_collaborators enable row level security;

revoke all on public.board_collaborators from anon, authenticated;
grant select on public.board_collaborators to authenticated;

-- This function is the single source of truth for board authorization.
-- SECURITY DEFINER avoids recursive RLS checks between boards and collaborators.
create or replace function public.current_board_role(target_board_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when board.user_id = auth.uid() then 'owner'
    else (
      select collaborator.role
      from public.board_collaborators as collaborator
      where collaborator.board_id = board.id
        and collaborator.user_id = auth.uid()
    )
  end
  from public.boards as board
  where board.id = target_board_id;
$$;

revoke all on function public.current_board_role(uuid) from public;
grant execute on function public.current_board_role(uuid) to authenticated;

drop policy if exists "Users can view own boards" on public.boards;
drop policy if exists "Board members can view boards" on public.boards;
create policy "Board members can view boards"
on public.boards
for select
to authenticated
using (public.current_board_role(id) is not null);

drop policy if exists "Users can update own boards" on public.boards;
drop policy if exists "Board editors can update boards" on public.boards;
create policy "Board editors can update boards"
on public.boards
for update
to authenticated
using (public.current_board_role(id) in ('owner', 'editor'))
with check (public.current_board_role(id) in ('owner', 'editor'));

-- Editors may change board material, never ownership or audit columns.
revoke update on public.boards from authenticated;
grant update (
  title,
  description,
  content,
  thumbnail_url,
  is_archived,
  updated_at
) on public.boards to authenticated;

drop policy if exists "Board members can view memberships" on public.board_collaborators;
create policy "Board members can view memberships"
on public.board_collaborators
for select
to authenticated
using (public.current_board_role(board_id) is not null);

-- Return all members without opening profile records to arbitrary searches.
create or replace function public.list_board_members(target_board_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_board_role(target_board_id) is null then
    raise exception 'You do not have access to this board.'
      using errcode = '42501';
  end if;

  return query
  select
    member.member_user_id,
    member.member_email,
    member.member_display_name,
    member.member_avatar_url,
    member.member_role,
    member.member_created_at
  from (
    select
      board.user_id as member_user_id,
      owner_profile.email as member_email,
      owner_profile.display_name as member_display_name,
      owner_profile.avatar_url as member_avatar_url,
      'owner'::text as member_role,
      board.created_at as member_created_at
    from public.boards as board
    left join public.profiles as owner_profile on owner_profile.id = board.user_id
    where board.id = target_board_id

    union all

    select
      collaborator.user_id,
      member_profile.email,
      member_profile.display_name,
      member_profile.avatar_url,
      collaborator.role,
      collaborator.created_at
    from public.board_collaborators as collaborator
    left join public.profiles as member_profile on member_profile.id = collaborator.user_id
    where collaborator.board_id = target_board_id
  ) as member
  order by
    case when member.member_role = 'owner' then 0 else 1 end,
    member.member_display_name nulls last;
end;
$$;

revoke all on function public.list_board_members(uuid) from public;
grant execute on function public.list_board_members(uuid) to authenticated;

create or replace function public.share_board_with_email(
  target_board_id uuid,
  invitee_email text,
  collaborator_role text
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitee public.profiles%rowtype;
begin
  if auth.uid() is null
    or public.current_board_role(target_board_id) is distinct from 'owner'
  then
    raise exception 'Only the board owner can invite collaborators.'
      using errcode = '42501';
  end if;

  if collaborator_role is null or collaborator_role not in ('editor', 'viewer') then
    raise exception 'Role must be editor or viewer.'
      using errcode = '22023';
  end if;

  select profile.*
  into invitee
  from public.profiles as profile
  where lower(profile.email) = lower(trim(invitee_email))
  limit 1;

  if invitee.id is null then
    raise exception 'No Manojalam account was found for that email.'
      using errcode = 'P0002';
  end if;

  if invitee.id = auth.uid() then
    raise exception 'You already own this board.'
      using errcode = '22023';
  end if;

  insert into public.board_collaborators (board_id, user_id, role, invited_by)
  values (target_board_id, invitee.id, collaborator_role, auth.uid())
  on conflict (board_id, user_id)
  do update set role = excluded.role, invited_by = auth.uid(), updated_at = now();

  return query
  select
    invitee.id,
    invitee.email,
    invitee.display_name,
    invitee.avatar_url,
    collaborator.role,
    collaborator.created_at
  from public.board_collaborators as collaborator
  where collaborator.board_id = target_board_id
    and collaborator.user_id = invitee.id;
end;
$$;

revoke all on function public.share_board_with_email(uuid, text, text) from public;
grant execute on function public.share_board_with_email(uuid, text, text) to authenticated;

create or replace function public.set_board_collaborator_role(
  target_board_id uuid,
  target_user_id uuid,
  collaborator_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or public.current_board_role(target_board_id) is distinct from 'owner'
  then
    raise exception 'Only the board owner can change collaborator access.'
      using errcode = '42501';
  end if;

  if collaborator_role is null or collaborator_role not in ('editor', 'viewer') then
    raise exception 'Role must be editor or viewer.'
      using errcode = '22023';
  end if;

  update public.board_collaborators
  set role = collaborator_role
  where board_id = target_board_id
    and user_id = target_user_id;

  if not found then
    raise exception 'Collaborator not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_board_collaborator_role(uuid, uuid, text) from public;
grant execute on function public.set_board_collaborator_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_board_collaborator(
  target_board_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or public.current_board_role(target_board_id) is distinct from 'owner'
  then
    raise exception 'Only the board owner can remove collaborators.'
      using errcode = '42501';
  end if;

  delete from public.board_collaborators
  where board_id = target_board_id
    and user_id = target_user_id;

  if not found then
    raise exception 'Collaborator not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_board_collaborator(uuid, uuid) from public;
grant execute on function public.remove_board_collaborator(uuid, uuid) to authenticated;

-- Supabase Realtime delivers authorized board updates to open collaborators.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'boards'
    )
  then
    alter publication supabase_realtime add table public.boards;
  end if;
end;
$$;
