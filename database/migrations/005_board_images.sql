-- Private image assets. Apply before deploying the client that writes references.
-- Compatible with owner-only installations and optional collaboration migration.
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-images', 'board-images', false, 4194304)
on conflict (id) do nothing;

create or replace function public.can_access_board_image(object_name text, writing boolean default false)
returns boolean language plpgsql stable security invoker set search_path = public
as $$
declare
  board_key text := split_part(object_name, '/', 1);
  is_owner boolean;
  member_role text;
begin
  if auth.uid() is null then return false; end if;
  -- This query honors the existing board SELECT policies (RLS). Compare as text
  -- so other storage paths cannot trigger UUID-cast errors.
  select b.user_id = auth.uid() into is_owner from public.boards b where b.id::text = board_key;
  if not found then return false; end if;
  if not writing or is_owner then return true; end if;
  -- Do not require a helper or table absent from older owner-only installations.
  if to_regclass('public.board_collaborators') is not null then
    execute 'select role from public.board_collaborators where board_id::text = $1 and user_id = auth.uid()'
      into member_role using board_key;
    return coalesce(member_role in ('owner', 'editor'), false);
  end if;
  return false;
end;
$$;
revoke all on function public.can_access_board_image(text, boolean) from public;
grant execute on function public.can_access_board_image(text, boolean) to authenticated;

drop policy if exists "Board members read images" on storage.objects;
create policy "Board members read images" on storage.objects for select to authenticated
using (bucket_id = 'board-images' and public.can_access_board_image(name, false));

drop policy if exists "Board editors upload images" on storage.objects;
create policy "Board editors upload images" on storage.objects for insert to authenticated
with check (bucket_id = 'board-images' and public.can_access_board_image(name, true));
-- Assets are immutable. Do not delete on edit: undo, snapshots and other tabs may
-- still reference them. Garbage collection must account for those references.
