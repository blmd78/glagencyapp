-- 0093 — Repos : copier le setup de la semaine précédente (demande Benoit 2026-07-29,
-- « si d'une semaine à l'autre on n'a pas de changement »).
--
-- RPC SECURITY DEFINER, même modèle que save_repos_cell (0090) : les policies d'écriture
-- directes restent admin-only, le contrôle vit dans la fonction.
--   • ADMIN UNIQUEMENT (v1) : pour un manager, la copie ne pourrait porter que sur son
--     sous-arbre → un planning PARTIEL qui bloquerait ensuite la copie des autres (sémantique
--     piégeuse). À ouvrir plus tard si le besoin apparaît.
--   • JAMAIS d'écrasement : refuse si la semaine cible contient déjà du CONTENU (un chatter
--     ou du texte legacy). Les lignes vestigielles vides (case remplie puis vidée) ne
--     bloquent pas — l'insert les recouvre par upsert.
--   • La compo des COLONNES (rest_planning_column_members) n'est pas copiée : elle est datée
--     (effective_from ≤ semaine) et se reporte déjà toute seule.
-- Retourne le nombre de cases copiées (0 = semaine précédente vide, l'app l'affiche).
create or replace function public.copy_repos_week(p_to date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'repos_acces_refuse';
  end if;
  -- Les semaines sont keyées par leur LUNDI (convention app) — un appel direct avec une
  -- autre date créerait une semaine fantôme invisible de l'UI.
  if extract(isodow from p_to) <> 1 then
    raise exception 'repos_semaine_invalide';
  end if;
  if exists (
    select 1 from rest_planning_cells
    where week_start = p_to
      and (coalesce(array_length(chatter_ids, 1), 0) > 0 or names <> '')
  ) then
    raise exception 'repos_semaine_non_vide';
  end if;

  insert into rest_planning_cells (week_start, day, col, chatter_ids, names, updated_at, updated_by)
  select p_to, day, col, chatter_ids, names, now(), (select auth.uid())
  from rest_planning_cells
  where week_start = p_to - 7
    and (coalesce(array_length(chatter_ids, 1), 0) > 0 or names <> '')
  on conflict (week_start, day, col) do update
    set chatter_ids = excluded.chatter_ids,
        names       = excluded.names,
        updated_at  = excluded.updated_at,
        updated_by  = excluded.updated_by;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.copy_repos_week(date) from public, anon;
grant execute on function public.copy_repos_week(date) to authenticated;
