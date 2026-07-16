-- Le planning d'un ADMIN n'est modifiable que par un SUPERADMIN (les admins consultent).
-- L'app le garde (requireCanEdit dans features/planning/actions.ts) ; ceci est la
-- ceinture au niveau base — les actions planning passent par le client SESSION.

create or replace function public.can_edit_planning_of(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() and (
    public.is_superadmin()
    or not exists (
      select 1 from profiles p where p.id = target and p.role in ('admin', 'superadmin')
    )
  );
$$;
revoke all on function public.can_edit_planning_of(uuid) from public;
grant execute on function public.can_edit_planning_of(uuid) to authenticated;

drop policy if exists plannings_ins on plannings;
create policy plannings_ins on plannings for insert to authenticated
  with check (public.can_edit_planning_of(profile_id));
drop policy if exists plannings_upd on plannings;
create policy plannings_upd on plannings for update to authenticated
  using (public.can_edit_planning_of(profile_id)) with check (public.can_edit_planning_of(profile_id));
drop policy if exists plannings_del on plannings;
create policy plannings_del on plannings for delete to authenticated
  using (public.can_edit_planning_of(profile_id));

drop policy if exists planning_blocks_ins on planning_blocks;
create policy planning_blocks_ins on planning_blocks for insert to authenticated
  with check (exists (
    select 1 from plannings p where p.id = planning_id and public.can_edit_planning_of(p.profile_id)
  ));
drop policy if exists planning_blocks_upd on planning_blocks;
create policy planning_blocks_upd on planning_blocks for update to authenticated
  using (exists (
    select 1 from plannings p where p.id = planning_id and public.can_edit_planning_of(p.profile_id)
  ))
  with check (exists (
    select 1 from plannings p where p.id = planning_id and public.can_edit_planning_of(p.profile_id)
  ));
drop policy if exists planning_blocks_del on planning_blocks;
create policy planning_blocks_del on planning_blocks for delete to authenticated
  using (exists (
    select 1 from plannings p where p.id = planning_id and public.can_edit_planning_of(p.profile_id)
  ));
