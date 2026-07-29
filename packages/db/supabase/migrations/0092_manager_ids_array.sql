-- 0092 — Multi-rattachement : `profiles.manager_ids uuid[]` remplace `manager_id` (uuid seul).
--
-- POURQUOI (décision Benoit 2026-07-29) : l'orga réelle n'est pas un arbre strict — un
-- chatteur peut dépendre de PLUSIEURS encadrants (et un sous-manager de plusieurs managers).
-- Le rattachement unique laissait 78/96 chatteurs hors du périmètre de tout manager.
-- Forme retenue : un TABLEAU d'ids (idiome du repo : rest_planning_cells.chatter_ids,
-- rest_planning_column_members.creator_ids), pas de table de liaison — échelle ~115 profils.
--
-- TOUTE la hiérarchie passe par 4 fonctions SQL nommées : on réécrit leurs CORPS sur le
-- tableau, signatures inchangées → AUCUNE policy RLS n'est touchée, et tout ce qui les
-- consomme (0087 lecture transitive, 0090/0091 repos, todos, planning, compta) hérite du
-- multi automatiquement.
--
-- `manager_id` (colonne) est CONSERVÉE mais DÉPRÉCIÉE — plus rien ne la lit ni ne l'écrit
-- après cette migration + le déploiement app associé ; à dropper dans une migration
-- ultérieure une fois la release en prod (zero-downtime : l'ancienne app la sélectionne
-- encore pendant la fenêtre de déploiement).

alter table public.profiles add column manager_ids uuid[] not null default '{}';

-- Backfill depuis le rattachement existant (Rych → Jordan conservé).
update public.profiles set manager_ids = array[manager_id] where manager_id is not null;

-- Auto-rattachement interdit (miroir de profiles_manager_not_self). Un cycle A→B→A reste
-- possible comme avant — la borne de profondeur 6 de managed_subtree le contient.
alter table public.profiles add constraint profiles_not_own_manager
  check (not (id = any (manager_ids)));

-- Les fonctions filtrent par « contient tel id » : index GIN (l'équivalent de l'index btree
-- profiles_manager_id_idx de 0055 pour la colonne scalaire).
create index profiles_manager_ids_gin on public.profiles using gin (manager_ids);

-- Le uuid[] n'a pas de FK : ce trigger remplace l'ON DELETE SET NULL de l'ancienne colonne
-- (supprimer un encadrant retire son id de tous les rattachements, quel que soit le chemin
-- de suppression — deleteMember app ou cascade auth.users).
create or replace function public.profiles_detach_deleted_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set manager_ids = array_remove(manager_ids, old.id)
  where manager_ids @> array[old.id];
  return old;
end;
$$;
revoke all on function public.profiles_detach_deleted_manager() from public, anon, authenticated;
create trigger profiles_detach_manager
  before delete on public.profiles
  for each row execute function public.profiles_detach_deleted_manager();

-- ── Les 4 fonctions hiérarchie basculent sur le tableau (corps seuls, signatures intactes) ──

-- Rattaché DIRECT (0054) — consommée par ~10 policies dont les écritures compta.
create or replace function public.manages(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = target and manager_ids @> array[(select auth.uid())]
  );
$$;

-- Planning (0061) : un manager gère ses sous-managers rattachés.
create or replace function public.can_manage_planning_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles caller
    join profiles t on t.id = target
    where caller.id = (select auth.uid())
      and caller.role = 'manager'
      and t.role = 'sous-manager'
      and t.manager_ids @> array[caller.id]
  );
$$;

-- Sous-arbre récursif (0087). Le multi fait du graphe un DAG : un même profil peut être
-- atteint par plusieurs branches → dédoublonnage en sortie (distinct) ; la profondeur 6
-- reste la garde anti-cycle.
create or replace function public.managed_subtree()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  with recursive sub as (
    select id, 1 as depth
    from profiles
    where manager_ids @> array[(select auth.uid())]
    union all
    select p.id, s.depth + 1
    from profiles p
    join sub s on p.manager_ids @> array[s.id]
    where s.depth < 6
  )
  select distinct id from sub;
$$;

-- Périmètre to-do (0091) — même traduction que can_write_todo_of, branche rattachement en
-- tableau.
create or replace function public.writable_todo_targets()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select id, role from profiles where id = (select auth.uid())
  )
  select t.id
  from profiles t, me
  where t.role in ('superadmin', 'admin', 'manager', 'sous-manager')
    and (
      (me.role in ('admin', 'superadmin')
        and (me.role = 'superadmin' or t.role not in ('admin', 'superadmin')))
      or (me.role = 'manager' and t.role = 'sous-manager' and t.manager_ids @> array[me.id])
      or (t.id = me.id and me.role in ('superadmin', 'admin', 'manager', 'sous-manager'))
    );
$$;
