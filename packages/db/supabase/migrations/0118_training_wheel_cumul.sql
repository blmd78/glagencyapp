-- 0118 — Roue des récompenses : les tours S'ACCUMULENT, l'octroi rattrape les semaines manquées et
-- ne dépend plus de l'ouverture de la page Roue.
--
-- Demande métier (2026-08-22) : gagner trois semaines de suite sans jouer doit donner trois tours ;
-- et l'octroi doit se déclencher depuis n'importe quelle page de la face Formation.
--
-- CE QUI CLOCHAIT
--   1. `training_wheel_tickets_one_pending_idx` imposait « un seul ticket non utilisé par
--      personne ». L'octroi insérant en `on conflict do nothing` SANS cible, le deuxième ticket
--      était refusé EN SILENCE : la semaine gagnée disparaissait, définitivement (l'unicité par
--      semaine interdisait de la ré-octroyer plus tard).
--   2. L'octroi ne regardait que la DERNIÈRE semaine complète, et n'était déclenché que par la
--      visite de `/formation/roue`. Une semaine sans aucune visite = tickets jamais créés.
--   3. `training_wheel_ranking_raw` (0116) avait été écrite SANS le filtre `frm-entrainement` que
--      porte `training_weekly_ranking`. Ce n'est pas qu'un ticket fantôme : un chatteur qui a perdu
--      le droit Entraînement mais garde de bons scores DÉCALE LES RANGS et pousse un légitime hors
--      du top N. Bug déjà en production depuis 0116 — c'est le correctif le plus urgent de ce lot.
--
-- Migration SÛRE À APPLIQUER AVANT le déploiement du code : aucun droit retiré, et les signatures
-- restent appelables telles quelles (`training_wheel_pending(p_profile)` garde son défaut sur
-- `p_top`, `training_wheel_grant_week` reste en place pour le code actuellement en prod).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Plusieurs tours en attente : l'unicité tombe, l'index de lecture reste.
--
-- L'index partiel redevient NON unique, et sa clé suit la lecture réelle de la page et de
-- `claimTicket` : « mes tours non utilisés, du plus ancien au plus récent ».
drop index if exists public.training_wheel_tickets_one_pending_idx;
drop index if exists public.training_wheel_tickets_pending_idx;
create index training_wheel_tickets_pending_idx
  on public.training_wheel_tickets (profile_id, week, created_at)
  where used_at is null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. L'unicité par semaine ne vaut plus que pour les tickets DU CLASSEMENT.
--
-- Elle DOIT rester : c'est elle qui rend l'octroi idempotent (deux visites simultanées ne créent
-- pas deux tickets pour la même semaine). Mais elle interdisait aussi le tour OFFERT à la main
-- (`granted_by` non null), qui n'est lié à aucun classement : impossible d'offrir un tour à
-- quelqu'un qui avait déjà gagné cette semaine-là. On la restreint donc aux tickets SYSTÈME.
alter table public.training_wheel_tickets
  drop constraint if exists training_wheel_tickets_profile_id_week_key;
create unique index if not exists training_wheel_tickets_semaine_systeme_uidx
  on public.training_wheel_tickets (profile_id, week)
  where granted_by is null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Fenêtre de rattrapage : les 4 dernières semaines complètes.
--
-- Pourquoi une fenêtre et pas « tout depuis le début » : l'octroi est déclenché par une visite
-- (aucun cron sur ce projet — écarté en 0116, jamais installé ni recetté ici). Sans borne, chaque
-- visite rejouerait le classement de toutes les semaines depuis la mise en service pour ne rien
-- trouver. Quatre semaines = toute la promo peut disparaître un mois sans rien perdre.
-- Le plancher est le lundi précédant la mise en service de la Formation : avant, aucune session
-- notée — il interdit surtout d'inventer des tickets rétroactifs si un import de données anciennes
-- arrivait un jour.
create or replace function public.training_wheel_weeks_open()
returns setof date
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select (public.training_last_week() - (7 * g))::date
  from generate_series(0, 3) as g
  where (public.training_last_week() - (7 * g)) >= date '2026-08-10'
  order by 1;
$$;

revoke all on function public.training_wheel_weeks_open() from public, anon, authenticated;
grant execute on function public.training_wheel_weeks_open() to service_role;

comment on function public.training_wheel_weeks_open() is
$cmt$semaines complètes encore ouvertes à l'octroi (fenêtre glissante de 4, plancher = mise en service)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Classement interne : ALIGNEMENT sur `training_weekly_ranking` (correctif d'un bug 0116).
--
-- `create or replace` à l'identique de 0116, à UNE clause près : `'frm-entrainement' = any(p.pages)`.
-- Sans elle, un chatteur qui a perdu le droit Entraînement mais garde `role = 'chatteur'` et de bons
-- scores restait dans le calcul et DÉCALAIT LES RANGS — poussant un légitime top N au rang suivant,
-- qui ne recevait donc rien. La page, elle, lit `training_weekly_ranking` (filtrée) : les deux
-- classements se contredisaient.
create or replace function public.training_wheel_ranking_raw(p_week date)
returns table (profile_id uuid, points integer, rn bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select (p_week::timestamp at time zone 'Europe/Paris') as t0,
           ((p_week + 7)::timestamp at time zone 'Europe/Paris') as t1
  ),
  best as (
    select s.profile_id, s.case_id, max(s.total) as best_total, min(s.scored_at) as first_at
    from training_sessions s
    join training_cases c on c.id = s.case_id
    cross join bounds b
    where s.status = 'scored' and s.total is not null and c.kind <> 'boss'
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  ),
  agrege as (
    select b.profile_id,
           sum(b.best_total)::integer as points,
           round(avg(b.best_total), 2) as avg_total,
           min(b.first_at) as first_at
    from best b
    join profiles p on p.id = b.profile_id
    where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    group by b.profile_id
  )
  select a.profile_id, a.points,
         row_number() over (order by a.points desc, a.avg_total desc nulls last, a.first_at asc)
  from agrege a;
$$;

revoke all on function public.training_wheel_ranking_raw(date) from public, anon, authenticated;
grant execute on function public.training_wheel_ranking_raw(date) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Octroi sur TOUTE la fenêtre ouverte (accumulation + rattrapage).
create or replace function public.training_wheel_grant_open_weeks(p_top integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week  date;
  v_total integer := 0;
begin
  for v_week in select * from public.training_wheel_weeks_open() loop
    v_total := v_total + public.training_wheel_grant_week(v_week, p_top);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.training_wheel_grant_open_weeks(integer) from public, anon, authenticated;
-- EXPLICITE plutôt qu'hérité des privilèges par défaut : depuis ce lot, c'est le SEUL chemin de
-- distribution des tours (le repli applicatif « je vérifie mon propre top 3 » ne fait plus que
-- doubler celui-ci). Une panne de droits ici arrêterait toute récompense.
grant execute on function public.training_wheel_grant_open_weeks(integer) to service_role;
grant execute on function public.training_wheel_grant_week(date, integer) to service_role;

comment on function public.training_wheel_grant_open_weeks(integer) is
$cmt$octroie les tickets du top p_top sur toute la fenêtre ouverte (idempotent) — permet le rattrapage des semaines sans visite$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Octroi AUTO-LIMITÉ, appelable depuis n'importe quelle page de la face.
--
-- Un HORODATAGE, volontairement, et pas « la dernière semaine octroyée » : l'octroi doit pouvoir
-- REJOUER dans la semaine. `on conflict do nothing` absorbe aussi l'index partiel des tickets — un
-- chatter qui traîne un vieux tour n'est servi qu'une fois celui-ci joué. Avec une mémoire à la
-- semaine, cet oubli serait définitif ; un throttle d'une heure le rattrape tout seul.
alter table public.training_wheel_config add column if not exists last_granted_at timestamptz;

comment on column public.training_wheel_config.last_granted_at is
$cmt$dernière TENTATIVE d'octroi automatique — throttle de training_wheel_grant_due, pas une garantie d'unicité (celle-ci vient des unicités de training_wheel_tickets)$cmt$;

create or replace function public.training_wheel_grant_due(p_top integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_intervalle constant interval := interval '1 hour';
  v_last  timestamptz;
  v_count integer;
begin
  -- CAS NOMINAL (quasi tous les appels) : UNE lecture de la ligne unique de config, par sa clé
  -- primaire. Pas de jointure, pas d'agrégat, pas de verrou.
  select c.last_granted_at into v_last from public.training_wheel_config c where c.id = 1;
  if v_last is not null and v_last > now() - c_intervalle then
    return 0;
  end if;

  -- Lundi matin, plusieurs visites simultanées. Verrou consultatif NON BLOQUANT : qui ne l'obtient
  -- pas repart aussitôt au lieu de refaire un agrégat déjà en cours ailleurs. C'est une optimisation
  -- de COÛT, pas la correction : celle-ci vient des unicités de tickets et du `on conflict do
  -- nothing`, qui rendent une double exécution inoffensive. `xact` : relâché au commit comme au
  -- rollback, jamais fuité.
  if not pg_try_advisory_xact_lock(118001) then
    return 0;
  end if;

  -- Relecture SOUS verrou : en READ COMMITTED, cette instruction voit le travail du concurrent qui
  -- vient de committer.
  select c.last_granted_at into v_last from public.training_wheel_config c where c.id = 1;
  if v_last is not null and v_last > now() - c_intervalle then
    return 0;
  end if;

  -- Un appel RPC = une transaction : si l'octroi échoue, la mémoire est annulée avec lui et la
  -- visite suivante réessaiera.
  v_count := public.training_wheel_grant_open_weeks(p_top);
  update public.training_wheel_config set last_granted_at = now() where id = 1;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.training_wheel_grant_due(integer) from public, anon, authenticated;
grant execute on function public.training_wheel_grant_due(integer) to service_role;

comment on function public.training_wheel_grant_due(integer) is
$cmt$octroi AUTO-LIMITÉ (throttle 1 h) — appelé en tâche de fond par le layout de la face Formation, jamais par un rôle client$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Pastille : le NOMBRE de tours en attente, et le top N n'est plus en dur.
--
-- `p_top` a un DÉFAUT : `training_wheel_pending(p_profile)` reste appelable tel quel par le code en
-- production pendant la fenêtre de déploiement. L'appelant passe désormais la constante du domaine
-- (`WHEEL_TOP_N`), ce qui supprime la valeur en dur qui se serait désynchronisée de l'octroi.
--
-- ⚠️ L'ANCIENNE SIGNATURE EST SUPPRIMÉE D'ABORD. Ajouter un paramètre à défaut ne remplace pas la
-- fonction : Postgres crée une SURCHARGE. Les deux coexistant, un appel à un seul argument devient
-- « function ... is not unique » — et cette fonction est appelée au rendu de CHAQUE page du CRM
-- (pastille de la sidebar). Vérifié sur l'UAT avant correction : l'appel échouait bel et bien.
drop function if exists public.training_wheel_pending(uuid);

create or replace function public.training_wheel_pending(p_profile uuid, p_top integer default 3)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pending integer;
  v_floor   date;
  v_week    date;
begin
  -- Cloisonnement : son propre compteur, ou celui d'un encadrant `frm-suivi`.
  if not (p_profile = (select auth.uid()) or (select public.has_page('frm-suivi'))) then
    return 0;
  end if;

  -- Tours DÉJÀ matérialisés : ils s'accumulent désormais, on les compte.
  select count(*) into v_pending
  from training_wheel_tickets t
  where t.profile_id = p_profile and t.used_at is null;
  if v_pending > 0 then
    return v_pending;
  end if;

  -- COURT-CIRCUIT DU CAS NOMINAL — cette fonction est appelée au rendu de CHAQUE page du CRM.
  -- Sans la moindre session notée sur la fenêtre, ce profil ne peut être top N d'aucune semaine :
  -- un `exists` indexé (préfixe `profile_id` de `training_sessions_profile_started_idx`) remplace
  -- jusqu'à quatre agrégations complètes du classement.
  select min(w) into v_floor from public.training_wheel_weeks_open() as w;
  if v_floor is null then
    return 0;
  end if;
  if not exists (
    select 1 from training_sessions s
    where s.profile_id = p_profile and s.status = 'scored' and s.total is not null
      and s.scored_at >= (v_floor::timestamp at time zone 'Europe/Paris')
  ) then
    return 0;
  end if;

  -- Éligibilité non encore matérialisée, sur toute la fenêtre : un tour dû pour une semaine dont
  -- l'octroi n'a pas encore tourné (personne n'a ouvert la face depuis).
  for v_week in select * from public.training_wheel_weeks_open() loop
    if not exists (
      select 1 from training_wheel_tickets t
      where t.profile_id = p_profile and t.week = v_week and t.granted_by is null
    ) and exists (
      select 1 from public.training_wheel_ranking_raw(v_week) r
      where r.profile_id = p_profile and r.points > 0 and r.rn <= p_top
    ) then
      v_pending := v_pending + 1;
    end if;
  end loop;

  return v_pending;
end;
$$;

revoke all on function public.training_wheel_pending(uuid, integer) from public, anon;
grant execute on function public.training_wheel_pending(uuid, integer) to authenticated;

comment on function public.training_wheel_pending(uuid, integer) is
$cmt$nombre de tours en attente : tickets non utilisés (ils s'ACCUMULENT depuis 0118) + éligibilités non encore matérialisées sur la fenêtre ouverte$cmt$;
