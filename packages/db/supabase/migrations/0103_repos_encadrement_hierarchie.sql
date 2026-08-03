-- 0103 — Planning repos, colonnes d'encadrement : la règle devient HIÉRARCHIQUE.
--
-- 0102 ouvrait « sa » colonne à chacun. Règle affinée par Benoit (2026-08-03) — un manager
-- encadre, il doit pouvoir poser les repos de ceux qu'il encadre :
--
--   Colonne          | admin | manager        | sous-manager | police
--   -----------------|-------|----------------|--------------|-------------
--   Managers         | tout  | LUI-MÊME       | ✗            | ✗
--   Sous-managers    | tout  | tout le monde  | LUI-MÊME     | ✗
--   Policiers        | tout  | tout le monde  | ✗            | LUI-MÊME
--   Modèles (g1…g12) | tout  | tout le monde  | tout le monde| ✗
--
-- Un manager ne pose donc PAS un autre manager : entre pairs, chacun s'inscrit. Il place en
-- revanche librement ses sous-managers et ses policiers.
--
-- ── LE POLICIER ÉTAIT BLOQUÉ AVANT MÊME D'ARRIVER ICI ───────────────────────────────────────
-- `can_write_page(slug)` = `is_admin() or (is_manager() and has_page(slug))`, et `is_manager()`
-- ne reconnaît QUE 'manager' et 'sous-manager'. Un policier échouait donc sur la toute première
-- garde, ce qui rendait l'auto-assignation de 0102 inopérante pour lui — le seul rôle pour qui
-- elle avait été explicitement demandée.
--
-- Élargir `is_manager()` aurait ouvert au policier TOUTES les écritures de TOUTES ses pages
-- (planning, quotas, scripts…) : un effet de bord sans rapport avec la demande. L'exception est
-- donc posée ICI, au plus près, et strictement bornée — il ne peut toucher que son propre nom
-- dans la seule colonne Policiers, et rien dans les colonnes de modèles.
--
-- Le delta est calculé sur la ligne VERROUILLÉE (`for update`) : deux sauvegardes concurrentes se
-- sérialisent, sinon chacune compare à un état déjà périmé et la seconde efface la première.

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

  -- ACCÈS : les encadrants par le chemin normal ; le policier par l'exception ci-dessus, qui ne
  -- lui ouvre rien de plus qu'une case de la colonne Policiers (contrôlé plus bas).
  if not (public.can_write_page('repos')
          or (v_role = 'police' and public.has_page('repos'))) then
    raise exception 'repos_acces_refuse';
  end if;

  if not (p_col ~ '^g([1-9]|1[0-2])$' or p_col in ('managers', 'sous-managers', 'policiers')) then
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
