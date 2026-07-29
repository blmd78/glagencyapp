-- 0096 — Repos : colonnes modèles DYNAMIQUES (g1..g12) + colonne encadrement « Sous-managers »
-- (demandes Benoit 2026-07-29 soir).
--
-- Côté app : une colonne modèle n'est rendue que si sa compo est non vide pour la semaine OU
-- si ses cases ont du contenu — vider la compo d'une colonne sans repos posés la fait
-- disparaître, et « Ajouter une colonne » (admin) reprend la première clé libre. Ici, seul le
-- RPC change : la whitelist des colonnes passe de g1..g6 à g1..g12 et accueille
-- 'sous-managers' (encadrement, admin-only comme managers/policiers). Corps identique à 0095
-- pour le reste.
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
  if p_col in ('managers', 'sous-managers', 'policiers') and not public.is_admin() then
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
