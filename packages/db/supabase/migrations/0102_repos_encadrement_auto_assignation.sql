-- 0102 — Planning repos : chacun pose SON repos dans la colonne de son rôle.
--
-- Les trois colonnes d'encadrement (Managers, Sous-managers, Policiers) étaient ADMIN-ONLY : un
-- manager qui voulait poser son propre jour de repos devait le demander. Demande Benoit
-- 2026-08-03 — chacun s'assigne lui-même dans SA colonne.
--
-- DEUX VERROUS, pas un :
--   1. LA COLONNE doit correspondre au rôle de l'appelant — un manager ne pose rien chez les
--      policiers ;
--   2. LE DELTA doit se limiter à l'appelant — il s'ajoute ou se retire, il ne touche pas aux
--      autres noms de la case. Sans ce second contrôle, « ouvrir la colonne aux managers »
--      revenait à laisser n'importe lequel d'entre eux effacer le repos d'un collègue.
--
-- Le delta (ajoutés ∪ retirés) est calculé sur la ligne VERROUILLÉE (`for update`) : deux
-- sauvegardes concurrentes se sérialisent ici, sinon chacune comparerait à un état déjà périmé et
-- le second écrivain effacerait le premier. C'est le verrou que 0090 avait introduit pour les
-- colonnes modèles et que la simplification de 0096 avait laissé tomber.
--
-- L'ADMIN garde la main sur tout, colonnes et personnes comprises.
--
-- Le mapping rôle → colonne existe aussi côté TS (`ENCADREMENT_COL_BY_ROLE`, features/repos/
-- types.ts) : les deux doivent rester alignés. Trois entrées, stables depuis la création des
-- colonnes — le coût d'un drift est nul devant celui d'un aller-retour SQL pour l'afficher.

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
  v_col_du_role text;
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
    select case role
             when 'manager' then 'managers'
             when 'sous-manager' then 'sous-managers'
             when 'police' then 'policiers'
           end
      into v_col_du_role
      from profiles
     where id = (select auth.uid());

    if p_col is distinct from v_col_du_role then
      raise exception 'repos_colonne_encadrement';
    end if;

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
