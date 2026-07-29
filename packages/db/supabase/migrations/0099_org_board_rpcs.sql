-- 0099 — Board Organisation : les deux écritures passent en RPC (un seul aller-retour).
--
-- POURQUOI : `saveOrgRow` enchaînait jusqu'à 10 requêtes SÉQUENTIELLES (contrôle du porteur,
-- porteur jumeau : 3 lectures + 2 écritures, rattachement : 1 lecture + 1 écriture, upserts)
-- et `saveOrgCell` en faisait plusieurs PAR personne touchée (lecture du lien, upsert, shift,
-- relecture du shift au retrait). Sur une base distante, c'est ce qui rendait la création
-- d'une ligne « super longue » (retour Benoit). Tout tient désormais dans une fonction :
-- 1 aller-retour, et les gardes descendent en SQL (même modèle que save_repos_cell, 0090).
--
-- SÉCURITÉ : SECURITY DEFINER + `is_admin()` en tête — l'édition du board reste admin-only
-- (v1), exactement comme la garde applicative qu'elles remplacent.

-- ── Composition d'une case (modèle × shift) ─────────────────────────────────────────────────
-- AJOUTÉ  → assigné au modèle + shift posé sur sa fiche chatteur (si lien MyPuls).
-- RETIRÉ  → désassigné du modèle SEULEMENT si son shift est encore celui de la case (un
--           déplacement entre shifts = retrait ici + ajout ailleurs, dans n'importe quel ordre).
create or replace function public.save_org_cell(
  p_creator_id uuid,
  p_shift text,
  p_chatter_ids uuid[],
  p_previous_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'org_acces_refuse';
  end if;
  if p_shift not in ('matin', 'aprem', 'soir') then
    raise exception 'org_shift_invalide';
  end if;
  if coalesce(array_length(p_chatter_ids, 1), 0) > 100
     or coalesce(array_length(p_previous_ids, 1), 0) > 100 then
    raise exception 'org_trop_de_lignes';
  end if;

  -- AJOUTS : uniquement des membres rôle chatteur.
  with added as (
    select id from unnest(p_chatter_ids) as t(id)
    except select id from unnest(p_previous_ids) as t(id)
  )
  insert into profile_creators (profile_id, creator_id)
  select a.id, p_creator_id
  from added a join profiles p on p.id = a.id and p.role = 'chatteur'
  on conflict (profile_id, creator_id) do nothing;

  with added as (
    select id from unnest(p_chatter_ids) as t(id)
    except select id from unnest(p_previous_ids) as t(id)
  )
  update chatters c set shift = p_shift
  from added a join profiles p on p.id = a.id and p.role = 'chatteur'
  where c.id = p.chatter_id;

  -- RETRAITS : seulement si le shift de la fiche est encore celui de la case.
  with removed as (
    select id from unnest(p_previous_ids) as t(id)
    except select id from unnest(p_chatter_ids) as t(id)
  )
  delete from profile_creators pc
  using removed r
  join profiles p on p.id = r.id
  join chatters c on c.id = p.chatter_id and c.shift = p_shift
  where pc.profile_id = r.id and pc.creator_id = p_creator_id;
end;
$$;
revoke execute on function public.save_org_cell(uuid, text, uuid[], uuid[]) from public, anon;
grant execute on function public.save_org_cell(uuid, text, uuid[], uuid[]) to authenticated;

-- ── Ligne du board (porteur × modèle) ───────────────────────────────────────────────────────
-- Remplace la paire précédente, aligne le PORTEUR JUMEAU (le manager d'une section porte
-- souvent le même modèle que son sous-manager — sinon l'ancien modèle « ressuscitait » en
-- ligne directe) et rattache le sous-manager à la section visée.
create or replace function public.save_org_row(
  p_owner_id uuid,
  p_creator_id uuid,
  p_prev_owner_id uuid,
  p_prev_creator_id uuid,
  p_section_manager_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_role text;
  v_still_carried boolean;
begin
  if not public.is_admin() then
    raise exception 'org_acces_refuse';
  end if;
  select role into v_owner_role from profiles where id = p_owner_id;
  if v_owner_role is null or v_owner_role not in ('admin', 'manager', 'sous-manager') then
    raise exception 'org_porteur_invalide';
  end if;

  if p_prev_owner_id is not null and p_prev_creator_id is not null then
    delete from profile_creators
    where profile_id = p_prev_owner_id and creator_id = p_prev_creator_id;
  end if;

  -- Porteur jumeau : le manager de la section suit la ligne, sauf si un AUTRE de ses
  -- sous-managers porte encore l'ancien modèle (son périmètre de lecture doit rester couvrant).
  if p_prev_creator_id is not null and p_prev_creator_id <> p_creator_id
     and p_section_manager_id is not null and v_owner_role = 'sous-manager'
     and exists (
       select 1 from profile_creators
       where profile_id = p_section_manager_id and creator_id = p_prev_creator_id
     )
  then
    select exists (
      select 1
      from profiles sm
      join profile_creators pc on pc.profile_id = sm.id and pc.creator_id = p_prev_creator_id
      where sm.role = 'sous-manager'
        and sm.id <> p_owner_id
        and sm.manager_ids @> array[p_section_manager_id]
    ) into v_still_carried;
    if not v_still_carried then
      delete from profile_creators
      where profile_id = p_section_manager_id and creator_id = p_prev_creator_id;
    end if;
    insert into profile_creators (profile_id, creator_id)
    values (p_section_manager_id, p_creator_id)
    on conflict (profile_id, creator_id) do nothing;
  end if;

  insert into profile_creators (profile_id, creator_id)
  values (p_owner_id, p_creator_id)
  on conflict (profile_id, creator_id) do nothing;

  -- Le porteur sous-manager doit appartenir à la section visée, sinon la ligne serait
  -- invisible (le board ne construit ses sections que par rattachement).
  if p_section_manager_id is not null and v_owner_role = 'sous-manager' then
    update profiles
    set manager_ids = array_append(manager_ids, p_section_manager_id)
    where id = p_owner_id and not (manager_ids @> array[p_section_manager_id]);
  end if;
end;
$$;
revoke execute on function public.save_org_row(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.save_org_row(uuid, uuid, uuid, uuid, uuid) to authenticated;
