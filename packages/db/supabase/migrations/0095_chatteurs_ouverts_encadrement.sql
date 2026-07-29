-- 0095 — Fin de l'assignation des chatteurs : tout encadrant (manager/sous-manager) a accès
-- à TOUS les chatteurs, selon ses pages (décision Benoit 2026-07-29 soir : « plus
-- d'assignation de chatteurs à des sous-managers ou managers, ils ont accès à tous les
-- chatteurs direct — juste ça qui change »).
--
-- CE QUI RESTE : le rattachement manager → SES sous-managers (`manager_ids` sur les profils
-- rôle sous-manager) — le planning journalier (can_manage_planning_of) et le périmètre to-do
-- (writable_todo_targets) ne bougent PAS : « un manager gère ses sous-managers, oui ».
--
-- CE QUI CHANGE :
--   1. manages(target) — consommée par les écritures compta/police — devient : l'appelant est
--      encadrant ET la cible est un chatteur. La page (can_write_page côté app) reste le
--      droit d'accès à la surface ; la population n'est plus bornée à « ses rattachés ».
--   2. profiles (lecture) : un encadrant voit tous les CHATTEURS + ses sous-managers + soi
--      (plus de sous-arbre récursif).
--   3. daily_reports (lecture) : idem — les comptes rendus de tous les chatteurs + de ses
--      sous-managers + les siens.
--   4. profile_creators (lecture) : un encadrant lit toutes les assignations de modèles
--      (sinon Membres montrerait des colonnes Modèles vides).
--   5. save_repos_cell : la garde « delta ⊆ sous-arbre » disparaît (plus de périmètre) — et
--      avec elle le verrou (il ne protégeait que le calcul du delta). Restent : page requise,
--      colonnes connues, colonnes encadrement admin-only, bornes d'entrée.
--   6. Données : manager_ids VIDÉ pour les chatteurs/police (l'assignation n'existe plus) ;
--      conservé pour les sous-managers (→ leurs managers).
--   7. managed_subtree() : plus consommée par personne après 2/3/5 → supprimée.

-- ── 1) manages : tout encadrant « gère » tout chatteur ───────────────────────────────────────
create or replace function public.manages(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_manager()
    and exists (select 1 from profiles where id = target and role = 'chatteur');
$$;

-- ── 2) profiles : chatteurs ouverts, sous-managers rattachés, soi ────────────────────────────
drop policy if exists profiles_self_admin_or_team_read on public.profiles;
create policy profiles_self_admin_or_team_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_manager())
        and (role = 'chatteur' or manager_ids @> array[(select auth.uid())]))
  );

-- ── 3) daily_reports : mêmes auteurs visibles que les profils ────────────────────────────────
drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated
  using (
    (select public.is_admin())
    or profile_id = (select auth.uid())
    or ((select public.is_manager())
        and exists (
          select 1 from profiles p
          where p.id = profile_id
            and (p.role = 'chatteur' or p.manager_ids @> array[(select auth.uid())])
        ))
  );

-- ── 4) profile_creators : lisible par tout encadrant ─────────────────────────────────────────
drop policy if exists profile_creators_self_admin_or_team_read on public.profile_creators;
create policy profile_creators_self_admin_or_team_read on public.profile_creators for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_manager())
  );

-- ── 5) save_repos_cell : plus de garde de périmètre (page + colonnes seulement) ──────────────
create or replace function public.save_repos_cell(
  p_week_start date,
  p_day smallint,
  p_col text,
  p_chatter_ids uuid[],
  p_names text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_write_page('repos') then
    raise exception 'repos_acces_refuse';
  end if;
  if p_col not in ('g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'managers', 'policiers') then
    raise exception 'repos_colonne_inconnue';
  end if;
  if length(coalesce(p_names, '')) > 1000 then
    raise exception 'repos_names_trop_long';
  end if;
  if coalesce(array_length(p_chatter_ids, 1), 0) > 200
     or exists (select 1 from unnest(p_chatter_ids) x(id) where x.id is null) then
    raise exception 'repos_ids_invalides';
  end if;
  if p_col in ('managers', 'policiers') and not public.is_admin() then
    raise exception 'repos_colonne_encadrement';
  end if;

  insert into rest_planning_cells (week_start, day, col, chatter_ids, names, updated_at, updated_by)
  values (p_week_start, p_day, p_col, p_chatter_ids, trim(coalesce(p_names, '')), now(), (select auth.uid()))
  on conflict (week_start, day, col) do update
    set chatter_ids = excluded.chatter_ids,
        names       = excluded.names,
        updated_at  = excluded.updated_at,
        updated_by  = excluded.updated_by;
end;
$$;

-- ── 6) Données : l'assignation des chatteurs/police n'existe plus ────────────────────────────
update public.profiles set manager_ids = '{}'
where role in ('chatteur', 'police') and manager_ids <> '{}';

-- ── 7) managed_subtree : plus aucun consommateur ─────────────────────────────────────────────
drop function if exists public.managed_subtree();
