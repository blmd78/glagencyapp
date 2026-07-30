-- 0099 — Board Organisation : écritures en UN aller-retour, et le SHIFT devient une donnée du MEMBRE.
--
-- ── 1. POURQUOI DES RPC ─────────────────────────────────────────────────────────────────────
-- Les Server Actions du board enchaînaient les requêtes SÉQUENTIELLES : jusqu'à 10 pour créer
-- une ligne (contrôle du porteur, porteur jumeau, rattachement, upserts) et plusieurs PAR
-- personne touchée pour composer une case. Sur une base distante, c'est ce qui rendait l'édition
-- « super longue » (retour Benoit). Tout tient désormais dans deux fonctions : 1 aller-retour,
-- gardes descendues en SQL — même modèle que `save_repos_cell` (0090).
--
-- ── 2. POURQUOI LE SHIFT CHANGE DE TABLE ────────────────────────────────────────────────────
-- `chatters.shift` (0029) vivait sur la table miroir de MyPuls, alors que l'ingestion ne l'écrit
-- JAMAIS (vérifié : aucune occurrence dans apps/ingestion ni packages/mypuls). C'est une donnée
-- 100 % CRM, saisie à la main, hébergée au mauvais endroit. Trois conséquences mesurées en prod
-- le 2026-07-29 :
--   • 10 membres rôle chatteur SANS lien MyPuls ne pouvaient pas avoir de shift : le board les
--     comptait dans « À placer » sans permettre de les placer ;
--   • 11 fiches `chatters` portaient un shift sans qu'aucun membre leur soit lié (anciens
--     chatteurs) — des shifts fantômes que rien n'affichait ;
--   • le champ Shift était admin-only dans Membres UNIQUEMENT parce que `getMembers` ne charge
--     la table `chatters` que pour un admin (le lien MyPuls est admin-only) — au point qu'un
--     manager enregistrant une simple modification de pages effaçait le shift (audit 2026-07-29).
-- Porté par `profiles`, le shift suit le membre : plus de dépendance au lien, plus de fantôme, et
-- sa lecture devient naturelle pour tout encadrant (0097).
--
-- `chatters.shift` n'est PAS supprimée ici : plus aucun code ne la lit, mais la dropper avant que
-- la prod soit à jour casserait la page Membres le temps du déploiement. Son `drop column` fera
-- l'objet d'une migration dédiée, une fois la prod alignée.

-- ── Le shift, colonne du membre ─────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists shift text
    check (shift is null or shift in ('matin', 'aprem', 'soir'));

comment on column profiles.shift is
  'Créneau du chatteur (matin/aprem/soir). Donnée CRM saisie à la main — remplace chatters.shift (0099). Null = à placer.';

-- Reprise des shifts existants via le lien MyPuls. Les fiches sans membre lié sont abandonnées
-- volontairement : elles ne correspondent à personne dans l'équipe actuelle.
update profiles p
set shift = c.shift
from chatters c
where c.id = p.chatter_id
  and p.role = 'chatteur'
  and c.shift is not null;

-- Le board interroge « les chatteurs d'un modèle rangés par shift » à chaque rendu.
create index if not exists profiles_role_shift_idx on profiles (role, shift) where role = 'chatteur';

-- ── Composition d'une case (modèle × shift) ─────────────────────────────────────────────────
-- AJOUTÉ  → assigné au modèle + shift posé sur le MEMBRE.
-- RETIRÉ  → désassigné du modèle SEULEMENT si son shift est encore celui de la case (un
--           déplacement entre shifts = retrait ici + ajout ailleurs, dans n'importe quel ordre).
--
-- DROIT : `can_write_page('organisation')` — composer une case est ouvert aux encadrants porteurs
-- de la page, exactement comme `save_repos_cell` pour le planning repos. La STRUCTURE
-- (`save_org_row`, plus bas) reste admin-only : elle réécrit l'organigramme.
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
  if not public.can_write_page('organisation') then
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
  update profiles p set shift = p_shift
  from added a
  where p.id = a.id and p.role = 'chatteur';

  -- RETRAITS : on désassigne du modèle SEULEMENT si le shift du membre est encore celui de la
  -- case. Un déplacement entre shifts voit alors un shift différent → no-op, l'assignation au
  -- modèle est préservée.
  with removed as (
    select id from unnest(p_previous_ids) as t(id)
    except select id from unnest(p_chatter_ids) as t(id)
  )
  delete from profile_creators pc
  using removed r
  join profiles p on p.id = r.id and p.shift = p_shift
  where pc.profile_id = r.id and pc.creator_id = p_creator_id;
end;
$$;
revoke execute on function public.save_org_cell(uuid, text, uuid[], uuid[]) from public, anon;
grant execute on function public.save_org_cell(uuid, text, uuid[], uuid[]) to authenticated;

-- ── Ligne du board (porteur × modèle) ───────────────────────────────────────────────────────
-- Remplace la paire précédente, aligne le PORTEUR JUMEAU (le manager d'une section porte souvent
-- le même modèle que son sous-manager — sinon l'ancien modèle « ressuscitait » en ligne directe)
-- et rattache le sous-manager à la section visée. ADMIN seul.
--
-- Les trois derniers arguments ont un `default null` : `supabase gen types` ne sait pas exprimer
-- la nullabilité d'un ARGUMENT et générerait `p_prev_owner_id: string`, que l'appelant TypeScript
-- ne pourrait pas satisfaire. Le défaut les rend OPTIONNELS côté types générés, et l'appelant omet
-- la clé (`?? undefined`) — même patron que `upsert_police_report` (0073).
create or replace function public.save_org_row(
  p_owner_id uuid,
  p_creator_id uuid,
  p_prev_owner_id uuid default null,
  p_prev_creator_id uuid default null,
  p_section_manager_id uuid default null
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

  -- Le porteur sous-manager doit appartenir à la section visée, sinon la ligne serait invisible
  -- (le board ne construit ses sections que par rattachement).
  if p_section_manager_id is not null and v_owner_role = 'sous-manager' then
    update profiles
    set manager_ids = array_append(manager_ids, p_section_manager_id)
    where id = p_owner_id and not (manager_ids @> array[p_section_manager_id]);
  end if;
end;
$$;
revoke execute on function public.save_org_row(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.save_org_row(uuid, uuid, uuid, uuid, uuid) to authenticated;

-- ── Déplacement d'une ÉQUIPE (le manager d'un sous-manager) ─────────────────────────────────
-- Dernière écriture du board qui restait en plusieurs requêtes : 2 lectures de contrôle (rôle du
-- sous-manager, rôle de la cible) puis l'UPDATE — le tout après la garde applicative. Regroupé
-- ici comme ses deux voisines : 1 aller-retour, contrôles en SQL.
--
-- Le rattachement est MULTI (`manager_ids` est un tableau, 0092) : on retire uniquement le
-- manager de la section quittée et on ajoute le nouveau, sans toucher aux autres. ADMIN seul.
create or replace function public.move_org_team(
  p_sous_manager_id uuid,
  p_to_manager_id uuid,
  p_from_manager_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sm_role text;
  v_to_role text;
begin
  if not public.is_admin() then
    raise exception 'org_acces_refuse';
  end if;
  select role into v_sm_role from profiles where id = p_sous_manager_id;
  if v_sm_role is distinct from 'sous-manager' then
    raise exception 'org_pas_de_sous_manager';
  end if;
  -- Un ADMIN peut diriger une équipe (Axel, Dorian) — cf. ATTACHABLE_ROLES côté app.
  select role into v_to_role from profiles where id = p_to_manager_id;
  if v_to_role is null or v_to_role not in ('admin', 'manager') then
    raise exception 'org_cible_invalide';
  end if;

  update profiles
  set manager_ids = (
    select array(
      select distinct x
      from unnest(
        array_append(
          array_remove(coalesce(manager_ids, '{}'), p_from_manager_id),
          p_to_manager_id
        )
      ) as t(x)
      where x is not null
    )
  )
  where id = p_sous_manager_id;
end;
$$;
revoke execute on function public.move_org_team(uuid, uuid, uuid) from public, anon;
grant execute on function public.move_org_team(uuid, uuid, uuid) to authenticated;
