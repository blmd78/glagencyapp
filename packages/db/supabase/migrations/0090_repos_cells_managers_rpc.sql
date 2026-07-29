-- 0090 — Repos : les managers posent les repos de leur sous-arbre, périmètre contrôlé EN SQL.
--
-- POURQUOI : le commit ed4b387 a ouvert saveReposCell aux managers/sous-managers porteurs de
-- la page repos en croyant la RLS déjà ouverte (0060) — or 0076 avait resserré
-- rest_cells_write/rest_cells_update à is_admin() : l'upsert échouait (42501) pour tout
-- non-admin, la feature était morte. Et rouvrir simplement les policies en
-- can_write_page('repos') serait insuffisant : le périmètre (sous-arbre + colonnes
-- encadrement admin-only) ne vivait qu'en applicatif, contournable en PostgREST direct, avec
-- une fenêtre lecture→upsert (TOCTOU) sans verrou.
--
-- MODÈLE RETENU : les policies d'écriture directes RESTENT admin-only (0076, inchangées) ;
-- les non-admins écrivent UNIQUEMENT via ce RPC SECURITY DEFINER qui porte tout le contrôle :
--   • droit : can_write_page('repos') (admin, ou manager/sous-manager porteur de la page) ;
--   • colonnes encadrement (managers/policiers) : admin uniquement ;
--   • périmètre : les ids AJOUTÉS/RETIRÉS (delta vs cellule actuelle, verrouillée FOR UPDATE
--     → TOCTOU fermée) doivent appartenir au sous-arbre de l'appelant (managed_subtree(),
--     0087) — les chatters d'autres équipes déjà posés transitent intacts ;
--   • `names` (texte libre legacy) : non contrôlable (pas d'ID) — limitation assumée, comme
--     côté app.
-- Realtime (0076) : le RPC fait un insert/upsert ordinaire → postgres_changes publie pareil.
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
  v_bad int;
begin
  if not public.can_write_page('repos') then
    raise exception 'repos_acces_refuse';
  end if;
  -- Colonnes connues seulement (un appel PostgREST direct peut envoyer n'importe quoi).
  if p_col not in ('g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'managers', 'policiers') then
    raise exception 'repos_colonne_inconnue';
  end if;
  if length(coalesce(p_names, '')) > 1000 then
    raise exception 'repos_names_trop_long';
  end if;
  -- Bornes miroir du schéma Zod applicatif (un appel direct ne passe pas par Zod).
  if coalesce(array_length(p_chatter_ids, 1), 0) > 200
     or exists (select 1 from unnest(p_chatter_ids) x(id) where x.id is null) then
    raise exception 'repos_ids_invalides';
  end if;

  if not public.is_admin() then
    if p_col in ('managers', 'policiers') then
      raise exception 'repos_colonne_encadrement';
    end if;
    -- Verrou de la ligne : ferme la fenêtre lecture→écriture de l'ancienne garde applicative
    -- (deux sauvegardes concurrentes sérialisent ici, le delta est calculé sur l'état verrouillé).
    select chatter_ids into v_before
    from rest_planning_cells
    where week_start = p_week_start and day = p_day and col = p_col
    for update;
    v_before := coalesce(v_before, '{}');

    -- Delta (ajoutés ∪ retirés) ⊆ sous-arbre de l'appelant, sinon refus.
    select count(*) into v_bad
    from (
      (select unnest(p_chatter_ids) except select unnest(v_before))
      union
      (select unnest(v_before) except select unnest(p_chatter_ids))
    ) d(id)
    where d.id not in (select public.managed_subtree());
    if v_bad > 0 then
      raise exception 'repos_hors_equipe';
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

-- Appelable par les utilisateurs connectés (le contrôle vit DANS la fonction) ; leçon 0088 :
-- les default privileges donnent EXECUTE à anon à la création → on révoque explicitement.
revoke execute on function public.save_repos_cell(date, smallint, text, uuid[], text) from public, anon;
grant execute on function public.save_repos_cell(date, smallint, text, uuid[], text) to authenticated;
