-- 0048 — Page Membres ouverte aux managers, avec RATTACHEMENT manager↔chatter :
-- profiles.manager_id (posé à la création par un manager, éditable par les admins).
-- Lecture RLS : un manager lit lui-même + SON équipe (manager_id = lui) — pas toute la
-- liste. AUCUNE écriture manager en base : créer/modifier/supprimer ses chatters passe
-- par le service-role gardé côté app (requireAdminOrManager + contrôles d'équipe) ;
-- l'update direct reste verrouillé admin/superadmin (0037/0038).

-- Rattachement : le manager d'un compte (null = non rattaché). on delete set null :
-- supprimer un manager détache ses chatters, il ne les supprime pas.
alter table profiles add column if not exists manager_id uuid references profiles(id) on delete set null;

-- Pas d'auto-rattachement (donnée absurde). Les cycles plus longs restent possibles
-- mais sans effet RLS (policies non récursives).
alter table profiles drop constraint if exists profiles_manager_not_self;
alter table profiles add constraint profiles_manager_not_self check (manager_id is null or manager_id <> id);

create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'manager');
$$;
revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;

-- manages(target) : l'appelant est le manager de rattachement du profil cible.
-- security definer : évite d'empiler l'évaluation RLS de profiles dans les policies
-- des autres tables (même patron que is_admin/is_superadmin).
create or replace function public.manages(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = target and manager_id = auth.uid());
$$;
revoke all on function public.manages(uuid) from public;
grant execute on function public.manages(uuid) to authenticated;

-- profiles : soi-même, admin, ou — pour un manager — les comptes rattachés à lui.
-- (le drop du nom *_manager_read couvre une éventuelle application de la version
-- intermédiaire de cette migration, jamais commitée)
drop policy if exists profiles_self_or_admin_read on profiles;
drop policy if exists profiles_self_admin_or_manager_read on profiles;
drop policy if exists profiles_self_admin_or_team_read on profiles;
create policy profiles_self_admin_or_team_read on profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_manager() and manager_id = auth.uid()));

-- profile_creators : idem — les assignations de SON équipe (colonne Modèles de la liste).
-- Le gate is_manager() est indispensable ici aussi : un manager DÉMIS (role → user par
-- un admin) satisferait encore manages() sur son ex-équipe tant qu'elle est rattachée.
drop policy if exists profile_creators_self_or_admin_read on profile_creators;
drop policy if exists profile_creators_self_admin_or_manager_read on profile_creators;
drop policy if exists profile_creators_self_admin_or_team_read on profile_creators;
create policy profile_creators_self_admin_or_team_read on profile_creators for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or (public.is_manager() and public.manages(profile_id)));
