-- Run after 003_board_folders.sql. Existing folders remain at the top level.
-- This migration never changes or deletes boards or board content.
begin;
alter table public.board_folders add column if not exists parent_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_folders_parent_fk' and conrelid = 'public.board_folders'::regclass) then
    alter table public.board_folders add constraint board_folders_parent_fk
      foreign key (user_id, parent_id) references public.board_folders(user_id, id);
  end if;
end;
$$;
create index if not exists board_folders_parent_idx on public.board_folders(user_id, parent_id);

-- Serialize hierarchy writes per account so concurrent moves cannot form cycles.
create or replace function public.validate_board_folder_parent()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.parent_id is not null and (new.parent_id = new.id or exists (
    with recursive ancestors as (
      select id, parent_id from public.board_folders where user_id = new.user_id and id = new.parent_id
      union
      select folder.id, folder.parent_id from public.board_folders folder
      join ancestors on folder.id = ancestors.parent_id where folder.user_id = new.user_id
    ) select 1 from ancestors where id = new.id
  )) then
    raise exception 'A folder cannot be moved into itself or one of its subfolders.';
  end if;
  return new;
end;
$$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'validate_board_folder_parent' and tgrelid = 'public.board_folders'::regclass) then
    create trigger validate_board_folder_parent before insert or update on public.board_folders
      for each row execute function public.validate_board_folder_parent();
  end if;
end;
$$;

-- Deleting one folder promotes its children; their boards and descendants stay put.
create or replace function public.promote_board_folder_children()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.user_id::text, 0));
  update public.board_folders set parent_id = old.parent_id
    where user_id = old.user_id and parent_id = old.id;
  return old;
end;
$$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'promote_board_folder_children' and tgrelid = 'public.board_folders'::regclass) then
    create trigger promote_board_folder_children before delete on public.board_folders
      for each row execute function public.promote_board_folder_children();
  end if;
end;
$$;
commit;
