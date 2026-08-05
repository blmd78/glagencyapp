-- 0105 — Repos : la whitelist des colonnes modèles passe de g1..g12 à g1..g30.
--
-- Les 12 emplacements de 0096 étaient une « large marge » quand les colonnes regroupaient
-- plusieurs modèles ; à une colonne par modèle (17 modèles actifs au 2026-08-05), le bouton
-- « Ajouter une colonne » disparaissait avant d'avoir couvert l'équipe. 30 = une colonne par
-- modèle avec la même marge d'avance que 0096 en son temps. Miroir app : MODEL_COL_KEYS
-- (apps/web features/repos/types.ts). Corps de la fonction identique à 0102 pour le reste —
-- seule la ligne du regex change.

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
declare
  v_before uuid[];
  v_role   text;
  v_libre  boolean := false;  -- l'appelant peut-il poser QUELQU'UN D'AUTRE dans cette colonne ?
begin
  select role into v_role from profiles where id = (select auth.uid());

  -- ACCÈS : les encadrants par le chemin normal ; le policier par l'exception (0102), qui ne
  -- lui ouvre rien de plus qu'une case de la colonne Policiers (contrôlé plus bas).
  if not (public.can_write_page('repos')
          or (v_role = 'police' and public.has_page('repos'))) then
    raise exception 'repos_acces_refuse';
  end if;

  if not (p_col ~ '^g([1-9]|[12][0-9]|30)$' or p_col in ('managers', 'sous-managers', 'policiers')) then
    raise exception 'repos_colonne_inconnue';
  end if;
  if length(coalesce(p_names, '')) > 1000 then
    raise exception 'repos_names_trop_long';
  end if;
  if coalesce(array_length(p_chatter_ids, 1), 0) > 200
     or exists (select 1 from unnest(p_chatter_ids) x(id) where x.id is null) then
    raise exception 'repos_ids_invalides';
  end if;

  if public.is_admin() then
    v_libre := true;

  elsif p_col in ('managers', 'sous-managers', 'policiers') then
    if p_col = 'managers' then
      -- Entre pairs : un manager s'inscrit lui-même, personne d'autre ne le fait pour lui.
      if v_role <> 'manager' then
        raise exception 'repos_colonne_encadrement';
      end if;
    elsif v_role = 'manager' then
      -- Il encadre les sous-managers et les policiers : il pose leurs repos.
      v_libre := true;
    elsif not ((p_col = 'sous-managers' and v_role = 'sous-manager')
            or (p_col = 'policiers' and v_role = 'police')) then
      raise exception 'repos_colonne_encadrement';
    end if;

  else
    -- Colonnes de MODÈLES : tout encadrant les remplit, le policier n'y a rien à faire (il n'est
    -- entré ici que par l'exception d'accès ci-dessus).
    if v_role = 'police' then
      raise exception 'repos_colonne_encadrement';
    end if;
    v_libre := true;
  end if;

  -- Édition bornée à soi : le delta (ajoutés ∪ retirés) ne doit contenir que l'appelant.
  if not v_libre then
    select chatter_ids into v_before
      from rest_planning_cells
     where week_start = p_week_start and day = p_day and col = p_col
       for update;
    v_before := coalesce(v_before, '{}');

    if exists (
      select 1
      from (
        (select unnest(p_chatter_ids) except select unnest(v_before))
        union
        (select unnest(v_before) except select unnest(p_chatter_ids))
      ) d(id)
      where d.id is distinct from (select auth.uid())
    ) then
      raise exception 'repos_encadrement_soi_meme';
    end if;
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

revoke execute on function public.save_repos_cell(date, smallint, text, uuid[], text) from public, anon;
grant execute on function public.save_repos_cell(date, smallint, text, uuid[], text) to authenticated;
