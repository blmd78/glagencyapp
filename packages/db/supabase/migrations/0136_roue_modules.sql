-- 0136 — La roue des MODULES : une 2ᵉ roue, celle du chatter.
--
-- Règle produit (2026-08-30) : un module terminé = un tour de roue. « Terminé » = tous les cas
-- ACTIFS du module validés à ≥ 60. 7 modules au catalogue (6 + le boss) = 7 tours, 8 secteurs
-- 6/6/7/7/7/8/8/8 €, aucun perdant. Espérance 7,125 € le tour, ~50 € pour un parcours complet.
--
-- La roue nº 1 (`/formation/roue`, l'encadrant qui lance pour quelqu'un) n'est PAS touchée. Les
-- deux roues écrivent dans le MÊME `training_wheel_spins` : une seule compta, un seul `paid_at`.
--
-- ⚠️ D5 — L'HISTORIQUE IMPORTÉ DE GLA NE PAIE PAS. 0123 l'énonce déjà (« seul ce qui DÉCIDE d'un
-- versement est filtré ») : l'import compte pour la progression, le classement et les trophées,
-- jamais pour de l'argent. Mesuré sur la prod le 2026-08-30 : sans ce filtre, 6 des 10 tours
-- rétroactifs auraient payé du travail fait ailleurs, et la reprise étant TOUJOURS OUVERTE, un
-- import aurait débloqué jusqu'à 50 € d'un coup. D'où deux choix, ci-dessous :
--   1. la complétion se lit dans `training_sessions` (`legacy_id is null`), PAS dans
--      `training_case_bests` — qui mélange les deux origines ;
--   2. l'octroi est branché sur le TRIGGER (AFTER UPDATE), pas dans `training_refresh_stats` —
--      que `training_legacy_refresh_all` (0123) appelle en boucle pendant un import.
--
-- Migration SÛRE À APPLIQUER AVANT le déploiement du code : purement additive (une table, une
-- colonne nullable, trois index, trois fonctions). Le seul index remplacé l'est à l'identique,
-- avec une clause en plus.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. La config de la roue (une seule ligne, éditable par un admin)
--
-- Table à part et pas une 2ᵉ ligne de `training_wheel_config` : la roue nº 1 est à DEUX étages
-- (secteur gagnant/perdant, puis lot dans le coffre). Celle-ci est à UN étage — le secteur EST le
-- montant. Détourner l'autre en laissant `sectors` inerte serait de la magie implicite.
-- La FORME du jsonb, elle, est celle de `training_wheel_config.prizes` : les mappers TS existants
-- (`toPrizes` / `prizesToJson`) et le type `WheelPrize` se réutilisent tels quels.
create table public.training_module_wheel_config (
  id         smallint primary key default 1 check (id = 1),
  title      text not null default 'La roue des modules' check (length(title) between 1 and 60),
  -- [{"label":"6 €","weight":1,"amount_eur":6}, …]
  segments   jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index training_module_wheel_config_updated_by_idx
  on public.training_module_wheel_config (updated_by);

insert into public.training_module_wheel_config (id, segments) values (
  1,
  '[{"label":"6 €","weight":1,"amount_eur":6},
    {"label":"6 €","weight":1,"amount_eur":6},
    {"label":"7 €","weight":1,"amount_eur":7},
    {"label":"7 €","weight":1,"amount_eur":7},
    {"label":"7 €","weight":1,"amount_eur":7},
    {"label":"8 €","weight":1,"amount_eur":8},
    {"label":"8 €","weight":1,"amount_eur":8},
    {"label":"8 €","weight":1,"amount_eur":8}]'::jsonb
);

alter table public.training_module_wheel_config enable row level security;

create policy training_module_wheel_config_read on public.training_module_wheel_config
  for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_wheel_config_admin_write on public.training_module_wheel_config
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Le ticket — on RÉVEILLE `training_wheel_tickets`
--
-- Table morte depuis 0122 (qui a supprimé tout l'octroi automatique) et VIDE en production
-- (0 ligne, vérifié le 2026-08-30). Le ticket est exactement le bon objet : un droit à un tour,
-- nominatif, consommable une fois. Inutile d'en inventer un autre.
alter table public.training_wheel_tickets
  add column module_id uuid references public.training_modules(id) on delete cascade;

comment on column public.training_wheel_tickets.module_id is
$cmt$module dont l'achèvement a offert ce tour (0136) — null = tour d'encadrant, ou ticket d'avant 0136$cmt$;

-- Un module ne paie qu'une fois, POUR TOUJOURS. C'est CET index qui rend l'octroi idempotent :
-- la fonction peut être rejouée à chaque notation sans jamais doubler un tour. (Même tour de main
-- que `trophy_key` en 0120.)
create unique index training_wheel_tickets_module_uidx
  on public.training_wheel_tickets (profile_id, module_id)
  where module_id is not null;

-- ⚠️ LE PIÈGE DE 0120, À NE PAS REFAIRE. L'index ci-dessous impose « un seul ticket SYSTÈME par
-- semaine ». Un ticket de module a `granted_by is null` ET `trophy_key is null` : DEUX MODULES
-- TERMINÉS LA MÊME SEMAINE tomberaient donc sur le même conflit — et comme l'octroi insère en
-- `on conflict do nothing`, le second tour disparaîtrait EN SILENCE. On ajoute la clause
-- manquante. (On le conserve plutôt que de le supprimer : il ne contraint plus rien aujourd'hui,
-- mais il redeviendrait juste si l'octroi au classement hebdo revenait un jour.)
drop index if exists public.training_wheel_tickets_semaine_systeme_uidx;
create unique index training_wheel_tickets_semaine_systeme_uidx
  on public.training_wheel_tickets (profile_id, week)
  where granted_by is null and trophy_key is null and module_id is null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. L'index qui rend la vérification gratuite
--
-- La question posée par l'octroi ET par l'écran du chatter est toujours la même : « ce couple
-- (profil, cas) a-t-il une session notée ≥ 60 jouée ICI ? ». Index partiel, donc étroit.
create index training_sessions_valides_ici_idx
  on public.training_sessions (profile_id, case_id)
  where status = 'scored' and legacy_id is null and total >= 60;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. L'octroi
--
-- SÉCURITÉ : `service_role` seul. La fonction ne vérifie PAS qui l'appelle — comme
-- `training_trophy_grant` en son temps. Exposée à `authenticated`, elle laisserait n'importe qui
-- s'offrir sept tours.
create or replace function public.training_module_wheel_grant(p_profile uuid, p_module uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_week  date := (date_trunc('week', (now() at time zone 'Europe/Paris'))::date);
begin
  if p_profile is null or p_module is null then
    return 0;
  end if;

  -- Garde de population : chatteur en poste, avec le droit Entraînement. MÊME filtre que
  -- `training_weekly_ranking` (0123_reprise_gla.sql:439). Un ex-chatteur ou un encadrant qui
  -- jouerait pour tester ne déclenche aucun versement.
  if not exists (
    select 1 from profiles p
    where p.id = p_profile and p.left_at is null and p.role = 'chatteur'
      and 'frm-entrainement' = any(p.pages)
  ) then
    return 0;
  end if;

  -- Module actif, et son titre pour le libellé du ticket.
  select m.title into v_title from training_modules m where m.id = p_module and m.active;
  if v_title is null then
    return 0;
  end if;

  -- Un module VIDE n'est pas « terminé », il n'a jamais été commencé. Ce test doit passer AVANT
  -- celui d'après : sur un module sans cas actif, le `not exists` ci-dessous est vrai par vacuité
  -- et paierait un tour pour rien.
  if not exists (select 1 from training_cases c where c.module_id = p_module and c.active) then
    return 0;
  end if;

  -- LE CŒUR. « Existe-t-il un cas actif de ce module que ce chatter n'ait pas validé ICI à ≥ 60 ? »
  -- Si oui, le module n'est pas fini. `legacy_id is null` = D5.
  if exists (
    select 1 from training_cases c
    where c.module_id = p_module and c.active
      and not exists (
        select 1 from training_sessions s
        where s.profile_id = p_profile and s.case_id = c.id
          and s.status = 'scored' and s.legacy_id is null and s.total >= 60
      )
  ) then
    return 0;
  end if;

  insert into public.training_wheel_tickets (profile_id, week, reason, module_id)
  values (p_profile, v_week, left('Module ' || v_title || ' terminé', 120), p_module)
  on conflict do nothing;

  return case when found then 1 else 0 end;
end;
$$;

revoke execute on function public.training_module_wheel_grant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_module_wheel_grant(uuid, uuid) to service_role;

comment on function public.training_module_wheel_grant(uuid, uuid) is
$cmt$octroie le tour de roue d'un module terminé (≥ 60 partout, sessions jouées ICI) — idempotent par l'unicité (profile_id, module_id)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Le déclencheur : le trigger, SURTOUT PAS `training_refresh_stats`
--
-- `training_refresh_stats` serait l'endroit naturel — et c'est le piège : `training_legacy_refresh_all`
-- (0123_reprise_gla.sql:367) l'appelle EN BOUCLE sur tous les cas d'un profil pendant un import GLA.
-- L'octroi y aurait payé l'import.
--
-- Le trigger, lui, est un `AFTER UPDATE OF status, scored_at` — et 0123:361 le note noir sur blanc :
-- « un INSERT ne le déclenche JAMAIS ». L'import insère. D5 est donc respectée PAR CONSTRUCTION,
-- pas par un filtre qu'on pourrait oublier de recopier.
--
-- `new.module_id` est une colonne `not null` de `training_sessions` : on ne vérifie qu'UN module
-- (≤ 23 cas), jamais les sept.
create or replace function public.training_on_session_scored()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform training_refresh_stats(new.profile_id, new.case_id, coalesce(new.scored_at, now()));
  perform training_module_wheel_grant(new.profile_id, new.module_id);
  return null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. La pastille de sidebar
--
-- Appelée au rendu de CHAQUE page du CRM : un `count` sur l'index partiel des tickets en attente,
-- rien d'autre. Tout est matérialisé au moment de la notation — contrairement à l'ancienne
-- `training_wheel_pending` (0118, supprimée par 0122), qui devait rejouer quatre classements
-- hebdo à chaque appel.
create or replace function public.training_module_wheel_pending(p_profile uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Cloisonnement : son propre compteur, ou celui de n'importe qui pour un encadrant `frm-suivi`.
  select case
    when p_profile = (select auth.uid()) or (select public.has_page('frm-suivi'))
      then (
        select count(*)::integer from training_wheel_tickets t
        where t.profile_id = p_profile and t.module_id is not null and t.used_at is null
      )
    else 0
  end;
$$;

revoke execute on function public.training_module_wheel_pending(uuid) from public, anon;
grant execute on function public.training_module_wheel_pending(uuid) to authenticated;

comment on function public.training_module_wheel_pending(uuid) is
$cmt$nombre de tours de roue de module en attente (tickets non utilisés)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. L'état par module, pour l'écran du chatter
--
-- « Combien de cas actifs, combien validés ICI » — agrégé en SQL et pas côté web : un chatter peut
-- avoir des centaines de sessions notées (l'import GLA en a chargé jusqu'à 400 pour un profil), et
-- un `select` nu tronquerait à 1000 lignes en silence.
--
-- SECURITY INVOKER, volontairement : la RLS de `training_sessions` fait déjà le cloisonnement (on
-- ne lit que ses propres sessions, ou toutes avec `frm-suivi`). Aucune garde à écrire, aucune à
-- oublier ; un `p_profile` forgé rend simplement des compteurs à zéro.
create or replace function public.training_module_wheel_state(p_profile uuid)
returns table (module_id uuid, cas_actifs integer, valides_ici integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.id,
         count(c.id)::integer,
         count(c.id) filter (where exists (
           select 1 from training_sessions s
           where s.profile_id = p_profile and s.case_id = c.id
             and s.status = 'scored' and s.legacy_id is null and s.total >= 60
         ))::integer
  from training_modules m
  join training_cases c on c.module_id = m.id and c.active
  where m.active
  group by m.id;
$$;

revoke execute on function public.training_module_wheel_state(uuid) from public, anon;
grant execute on function public.training_module_wheel_state(uuid) to authenticated;

comment on function public.training_module_wheel_state(uuid) is
$cmt$par module actif : nombre de cas actifs et nombre validés ≥ 60 sur une session JOUÉE ICI (legacy exclu, D5)$cmt$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 8. Rétroactif (décision D3)
--
-- Les modules déjà terminés paient leur tour au déploiement — sinon ceux qui ont bossé avant sont
-- les seuls à ne rien toucher. Même règle que l'octroi, D5 comprise.
--
-- COÛT mesuré sur la prod le 2026-08-30 : 4 tours ≈ 28 € (Emmanuelupmedia · relance,
-- Harindranto · relance, Reely · relance, Hanielshop · boss). C'était 10 tours ≈ 70 € avant D5.
insert into public.training_wheel_tickets (profile_id, week, reason, module_id)
select p.id,
       (date_trunc('week', (now() at time zone 'Europe/Paris'))::date),
       left('Module ' || m.title || ' terminé', 120),
       m.id
from profiles p
cross join training_modules m
where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
  and m.active
  and exists (select 1 from training_cases c where c.module_id = m.id and c.active)
  and not exists (
    select 1 from training_cases c
    where c.module_id = m.id and c.active
      and not exists (
        select 1 from training_sessions s
        where s.profile_id = p.id and s.case_id = c.id
          and s.status = 'scored' and s.legacy_id is null and s.total >= 60
      )
  )
on conflict do nothing;
