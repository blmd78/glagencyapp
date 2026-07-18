-- Planning journalier — un MANAGER gère (lit + édite) le planning de ses SOUS-MANAGERS
-- DIRECTS (profiles.role = 'sous-manager' rattachés via manager_id). Étend la RLS de
-- 0036/0043 ; les règles admin/superadmin et « chacun le sien » restent inchangées.
-- NON récursif : un manager ne voit pas les rattachés de ses sous-managers.
--
-- Effet en cascade (rien d'autre à modifier) :
--   • planning_blocks READ  : sa policy fait un `exists` sur plannings → hérite de la RLS
--                             lecture de plannings étendue ici.
--   • planning_blocks WRITE : passe par can_edit_planning_of(profile_id) → étendu ici.

-- Vrai ssi l'appelant est un MANAGER et la cible est un de SES sous-managers directs.
create or replace function public.can_manage_planning_of(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles caller
    join profiles t on t.id = target
    where caller.id = auth.uid()
      and caller.role = 'manager'
      and t.role = 'sous-manager'
      and t.manager_id = auth.uid()
  );
$$;
revoke all on function public.can_manage_planning_of(uuid) from public;
grant execute on function public.can_manage_planning_of(uuid) to authenticated;

-- LECTURE plannings : admin, soi, OU le manager de rattachement du sous-manager cible.
-- (select auth.uid()) : forme initplan conservée de 0057.
drop policy if exists plannings_read on plannings;
create policy plannings_read on plannings for select to authenticated
  using (
    public.is_admin()
    or profile_id = (select auth.uid())
    or public.can_manage_planning_of(profile_id)
  );

-- ÉCRITURE : on greffe la capacité manager sur le prédicat central. Couvre plannings
-- ins/upd/del ET planning_blocks ins/upd/del (qui l'appellent tous, cf. 0043).
create or replace function public.can_edit_planning_of(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (
    public.is_admin() and (
      public.is_superadmin()
      or not exists (
        select 1 from profiles p where p.id = target and p.role in ('admin', 'superadmin')
      )
    )
  )
  or public.can_manage_planning_of(target);
$$;
revoke all on function public.can_edit_planning_of(uuid) from public;
grant execute on function public.can_edit_planning_of(uuid) to authenticated;
