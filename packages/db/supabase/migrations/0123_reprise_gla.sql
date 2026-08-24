-- 0123 — Reprise des données Good Luck Agency (GLA) : socle de base.
-- Spec : docs/superpowers/specs/2026-08-24-formation-reprise-gla-design.md §3, §4, §5.
--
-- Ce que la migration pose, et POURQUOI :
--   1. `training_sessions.legacy_id` — la provenance devient interrogeable en SQL. C'est le seul
--      levier du filtre du classement hebdo (§3.6), la seconde barrière d'idempotence, et la base
--      du contrôle de comptage (§3.9) sans lequel un vol d'historique est invisible pour sa victime.
--   2. `training_legacy_claims` — qui a réclamé quoi. Les DEUX unicités (un identifiant réclamé une
--      seule fois, un profil qui ne réclame qu'un identifiant) sont tenues PAR LA BASE, pas par le
--      code : entre la lecture et l'écriture, une autre réclamation peut prendre la place.
--   3. `training_legacy_claim_attempts` — la trace d'audit et les compteurs anti-force-brute.
--      42 mots de passe GLA tombent en quelques secondes et 4 comptes sont le login lui-même : le
--      plafond est la seule chose qui protège ces comptes-là.
--   4. Les deux relâchements de contrainte sur `training_messages` (§4.3) — sans eux, 59 corps de
--      message et 196 médias gratuits rendent l'import impossible, et le tronquer produirait une
--      transcription mensongère dans un outil dont tout l'usage est pédagogique.
--   5. Le filtre `legacy_id is null` du classement hebdomadaire — le SEUL geste D6 qui reste.
--   6. Le `kind = 'formation'` de `member_events` et son trigger — surtout PAS `'lien'`, qui est le
--      lien MyPuls (celui qui impute le CA, donc la paie).
--
-- ⚠️ NE JAMAIS RECRÉER les fonctions supprimées par 0122 (`training_wheel_ranking_raw`,
-- `training_wheel_weeks_open`, `training_wheel_pending`, `training_wheel_grant_*`,
-- `training_trophy_grant`). Depuis 0121/0122 « le tour n'est plus GAGNÉ, il est DONNÉ » : il
-- n'existe plus aucun octroi automatique, donc aucune session importée ne peut créer un ticket.
-- Un `create or replace` sur l'une de ces fonctions serait le seul vrai moyen de rouvrir la fuite.
--
-- ÉCARTS ASSUMÉS vs §4.5 de la spec, tous deux imposés par le reste de la spec :
--   • `training_legacy_claim_attempts.resync` (colonne ajoutée) — §7.5 exige qu'une
--     resynchronisation « ne compte ni comme succès ni comme échec » et ne remette aucun compteur à
--     zéro. Sans un marqueur en base, la règle n'est pas exprimable : un succès de resynchronisation
--     est indiscernable d'un succès de preuve.
--   • `training_legacy_claim_settle` RETOURNE les trois refus métier au lieu de les lever. Une
--     `raise` annule la transaction, donc l'`update … set ok = true` de la tentative — or §2.3 et le
--     test 8.2/7 exigent que la collision laisse une ligne `ok = true` dans la trace. Le refus est
--     donc un code de retour ; l'appelant en fait un `BusinessError` français.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1) Provenance : training_sessions.legacy_id
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.training_sessions
  add column if not exists legacy_id text;

comment on column public.training_sessions.legacy_id is
  $cmt$identifiant de la session sur l'ancienne plateforme (Good Luck Agency) — null = session jouée ici ; le classement hebdomadaire (training_weekly_ranking) EXCLUT les lignes non nulles (D6) $cmt$;

-- Unique GLOBALEMENT (pas par profil) : c'est ce qui fait qu'une session GLA déjà importée sous un
-- AUTRE profil ne peut pas être dupliquée — le contrôle de comptage §3.9 s'appuie dessus pour
-- transformer ce silence en erreur explicite.
create unique index if not exists training_sessions_legacy_uidx
  on public.training_sessions (legacy_id) where legacy_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2) training_legacy_claims — le lien profil ↔ ancien compte
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Table dédiée plutôt qu'une colonne sur `profiles` (patron 0079) : elle porte AUSSI l'état de
-- resynchronisation, et elle garde la face Formation hors de `profiles`.

create table if not exists public.training_legacy_claims (
  -- PK et non simple FK : « un profil ne réclame qu'un identifiant », tenu par la base.
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  -- « un identifiant n'est réclamé qu'une fois ». Stocké en minuscules — la casse est portée par
  -- login_display, cf. ci-dessous.
  login_key       text not null unique check (login_key = lower(login_key) and length(login_key) between 1 and 64),
  -- PAS cosmétique : 151 logins GLA sur 235 portent des majuscules. Sans cette colonne, les
  -- messages « rattaché à l'identifiant « … » » affichent une casse fausse aux deux tiers du parc,
  -- et l'admin cherche dans GLA un login qui n'y figure pas sous cette forme.
  login_display   text not null check (length(login_display) between 1 and 64),
  claimed_at      timestamptz not null default now(),
  -- Verrou anti-concurrence (§3.3) : posé au démarrage d'un import, effacé à la fin. Fenêtre de
  -- 5 min — au-delà c'est un import mort, et il faut pouvoir reprendre.
  sync_started_at timestamptz,
  -- null = import jamais mené à son terme → l'encart dit « Récupération interrompue », jamais
  -- « repris — 0 sessions », qui serait un mensonge.
  last_sync_at    timestamptz,
  -- Sessions EFFECTIVEMENT comptées en base (§3.9), pas le nombre de lignes qu'on a tenté d'écrire.
  sessions_count  integer not null default 0 check (sessions_count >= 0),
  -- null = auto-réclamation par le chatter ; sinon l'admin qui a rattaché à la main (D7).
  linked_by       uuid references public.profiles(id) on delete set null,
  -- Détachement DOUX : la ligne survit et l'identifiant reste réservé. Un delete rendrait le login
  -- immédiatement réclamable — « détacher puis réclamer » deviendrait le vrai chemin de vol.
  detached_at     timestamptz
);
create index if not exists training_legacy_claims_linked_by_idx on public.training_legacy_claims (linked_by);

comment on table public.training_legacy_claims is
  $cmt$rattachement d'un profil à son ancien compte Good Luck Agency. Écriture SERVICE-ROLE uniquement (aucune policy d'écriture) ; les deux unicités sont la garantie anti-vol$cmt$;

alter table public.training_legacy_claims enable row level security;

-- Lecture : le propriétaire (l'encart de Ma formation), l'encadrant Formation, l'admin.
-- AUCUNE policy d'écriture : service-role, comme tout le reste de la face Formation (0121).
drop policy if exists training_legacy_claims_read on public.training_legacy_claims;
create policy training_legacy_claims_read on public.training_legacy_claims for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')) or (select public.is_admin()));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3) training_legacy_claim_attempts — trace d'audit et anti-abus
-- ════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.training_legacy_claim_attempts (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  login_key  text not null check (login_key = lower(login_key) and length(login_key) between 1 and 64),
  ip         text,
  ok         boolean not null default false,
  -- Une resynchronisation n'est PAS une tentative de preuve (§7.5) : la propriété est déjà établie.
  -- Elle est tracée (audit) mais EXCLUE de tous les compteurs — sans quoi son succès remettrait le
  -- compteur glissant à zéro et offrirait une force brute illimitée à qui possède son propre compte.
  resync     boolean not null default false,
  -- Échec NEUTRALISÉ par un admin (levée de verrou, §7.5). `cleared_at` plutôt qu'un delete : le
  -- déverrouillage ne doit pas effacer la trace de ce qui a motivé le verrou.
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists training_legacy_claim_attempts_profile_idx
  on public.training_legacy_claim_attempts (profile_id, created_at desc);
create index if not exists training_legacy_claim_attempts_login_idx
  on public.training_legacy_claim_attempts (login_key, created_at desc);
create index if not exists training_legacy_claim_attempts_ip_idx
  on public.training_legacy_claim_attempts (ip, created_at desc) where ip is not null;

comment on table public.training_legacy_claim_attempts is
  $cmt$tentatives de réclamation d'un ancien compte GLA (succès ET échecs). ADMIN-ONLY : c'est la carte des comptes ciblés, sur un parc dont 4 mots de passe sont le login lui-même$cmt$;

alter table public.training_legacy_claim_attempts enable row level security;

-- Une SEULE policy select, admin (patron `member_events_read`, 0108). La policy admin est
-- nécessaire : sans elle, l'écran qui permet de lever un verrou (§7.5) ne peut rien afficher.
drop policy if exists training_legacy_claim_attempts_read on public.training_legacy_claim_attempts;
create policy training_legacy_claim_attempts_read on public.training_legacy_claim_attempts for select to authenticated
  using ((select public.is_admin()));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4) Les deux relâchements de contrainte (D5, §4.3)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 4a. Plafond de longueur du corps : 1 000 → 200 000 caractères.
-- 59 messages GLA dépassent 1 000 caractères, le plus long fait 101 764. Tronquer, c'est produire
-- une transcription mensongère dans un outil dont tout l'usage est pédagogique.
alter table public.training_messages drop constraint training_messages_body_check;
alter table public.training_messages add constraint training_messages_body_check
  check (length(body) between 1 and 200000);

comment on constraint training_messages_body_check on public.training_messages is
  $cmt$borne LARGE, exigée par la reprise GLA (0123) : 59 messages importés dépassent 1000 car., le plus long en fait 101 764. La règle PRODUIT reste 1000 et vit dans features/training-session/schema.ts — elle ne s'applique qu'aux NOUVEAUX messages. Ne pas « corriger » cette borne en la resserrant$cmt$;

-- 4b. Borne basse du prix d'un média : 1 → 0.
-- 196 médias ont été envoyés gratuitement sur GLA. Le produit, lui, ne bouge pas : MEDIA_PRICE_MIN
-- reste à 1 côté Zod — un chatter ne doit pas pouvoir envoyer un média gratuit chez nous.
-- `media_price` reste un `integer` : le seul prix non entier du corpus (8,50 €) est arrondi à 9
-- par l'import (Math.round). Changer le type pour une ligne serait de la dette.
alter table public.training_messages drop constraint training_messages_media_price_check;
alter table public.training_messages add constraint training_messages_media_price_check
  check (media_price is null or media_price between 0 and 10000);

comment on constraint training_messages_media_price_check on public.training_messages is
  $cmt$borne basse à 0 depuis 0123 (reprise GLA : 196 médias gratuits). Seul l'import écrit des 0 — la règle produit (minimum 1 €) vit dans features/training-session/schema.ts$cmt$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 5) Les trois RPC — security definer, service-role uniquement
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Modèle : `recruit_start_attempt` (0115:39-85). Compte ET insert dans la MÊME transaction,
-- précédés des verrous : sans eux, une rafale concurrente lit toutes le même compte et insère
-- toutes (TOCTOU en READ COMMITTED). C'est exactement le bug que 0115 a corrigé.

-- ── 5a. claim_begin : rate-limit + trace, AVANT toute lecture de GLA ────────────────────────
create or replace function public.training_legacy_claim_begin(
  p_profile   uuid,
  p_login_key text,
  p_ip        text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Normalisation faite ICI, par Postgres, jamais côté JS : 6 logins GLA contiennent du non-ASCII
  -- et `String.toLowerCase()` ne suit pas les mêmes règles Unicode que `lower()`. Une divergence
  -- entre les deux est l'un des trois chemins qui mènent au mode d'échec silencieux de §3.9.
  v_key     text := lower(btrim(p_login_key));
  v_claim   public.training_legacy_claims%rowtype;
  v_resync  boolean := false;
  v_count   integer;
  v_last_ok timestamptz;
  v_id      uuid;
begin
  if p_profile is null or v_key is null or length(v_key) not between 1 and 64 then
    raise exception 'LEGACY_INPUT_INVALID' using errcode = 'P0001';
  end if;

  -- DEUX verrous, pas un, et dans cet ORDRE FIXE : la CIBLE d'abord, le PROFIL ensuite.
  -- Un verrou par profil ne sérialise pas deux profils qui visent le MÊME login — or le plafond
  -- par login est « tous profils confondus ». L'ordre fixe évite l'interblocage quand deux
  -- transactions visent les mêmes clés en sens inverse.
  perform pg_advisory_xact_lock(hashtext('legacy_login:' || v_key));
  perform pg_advisory_xact_lock(hashtext('legacy_claim:' || p_profile::text));

  -- Lecture de SA PROPRE ligne UNIQUEMENT. §3.2 interdit de consulter l'unicité de la CIBLE avant
  -- la preuve (ce serait un oracle d'énumération des 235 logins) ; lire son propre rattachement
  -- n'apprend rien à personne — le profil connaît déjà son état.
  select * into v_claim from public.training_legacy_claims where profile_id = p_profile;
  v_resync := found and v_claim.login_key = v_key and v_claim.detached_at is null;

  -- Un import ne peut pas se chevaucher avec lui-même (double-clic, deux onglets, admin et chatter
  -- au même instant) : les lignes sont protégées par le `do nothing`, mais les recalculs d'agrégats
  -- et l'UPDATE de streak s'entrelaceraient sur deux états différents.
  if v_claim.profile_id is not null
     and v_claim.sync_started_at is not null
     and v_claim.sync_started_at > now() - interval '5 minutes' then
    raise exception 'LEGACY_SYNC_RUNNING' using errcode = 'P0001';
  end if;

  if v_resync then
    -- Son seul plafond : 1 par heure et par profil. Sans lui, « Resynchroniser » déclenche à
    -- volonté une lecture de 57 Mo sur la production GLA — un impatient suffit à en faire un DoS.
    if v_claim.last_sync_at is not null and v_claim.last_sync_at > now() - interval '1 hour' then
      raise exception 'LEGACY_RESYNC_COOLDOWN' using errcode = 'P0001';
    end if;
  else
    -- (a) LE VRAI VERROU : 10 échecs cumulés non neutralisés. JAMAIS remis à zéro par un succès —
    -- c'est le point qui tient tout le reste (§7.5).
    select count(*) into v_count
      from public.training_legacy_claim_attempts
     where profile_id = p_profile and not ok and not resync and cleared_at is null;
    if v_count >= 10 then
      raise exception 'LEGACY_LOCKED' using errcode = 'P0001';
    end if;

    -- (b) Fenêtre glissante : 5 échecs / 15 min, comptés APRÈS le dernier succès de preuve.
    -- Celui-ci se remet à zéro sur succès — c'est son rôle : absorber le légitime qui se trompe.
    select max(created_at) into v_last_ok
      from public.training_legacy_claim_attempts
     where profile_id = p_profile and ok and not resync;
    select count(*) into v_count
      from public.training_legacy_claim_attempts
     where profile_id = p_profile and not ok and not resync
       and created_at >= now() - interval '15 minutes'
       and (v_last_ok is null or created_at > v_last_ok);
    if v_count >= 5 then
      raise exception 'LEGACY_RATE_LIMITED' using errcode = 'P0001';
    end if;

    -- (c) Filet par IP. `p_ip is null` ⇒ AUCUNE limite (0115:57-59) : on ne bloque pas tout le
    -- monde derrière un `null` commun en dev.
    if p_ip is not null then
      select count(*) into v_count
        from public.training_legacy_claim_attempts
       where ip = p_ip and created_at >= now() - interval '24 hours';
      if v_count >= 20 then
        raise exception 'LEGACY_RATE_LIMITED' using errcode = 'P0001';
      end if;
    end if;

    -- (d) Gel par login cible : 6 échecs / 24 h GLISSANTES, tous profils confondus, en ne comptant
    -- QUE les profils n'ayant pas déjà réclamé (ils ne sont pas des candidats au vol). Seuil bas
    -- pour être atteignable par un attaquant seul, fenêtre glissante pour que le grief s'épuise
    -- tout seul. Le message rendu est le MÊME que celui du plafond par profil (§2.3) : lui donner
    -- un texte propre le transformerait en signal « ce login est activement ciblé ».
    select count(*) into v_count
      from public.training_legacy_claim_attempts a
     where a.login_key = v_key and not a.ok and not a.resync and a.cleared_at is null
       and a.created_at >= now() - interval '24 hours'
       and not exists (select 1 from public.training_legacy_claims c where c.profile_id = a.profile_id);
    if v_count >= 6 then
      raise exception 'LEGACY_LOGIN_FROZEN' using errcode = 'P0001';
    end if;
  end if;

  -- `ok = false` par défaut : une tentative qui ne se règle jamais (crash, timeout) reste un échec.
  insert into public.training_legacy_claim_attempts (profile_id, login_key, ip, ok, resync)
  values (p_profile, v_key, p_ip, false, v_resync)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.training_legacy_claim_begin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.training_legacy_claim_begin(uuid, text, text) to service_role;
comment on function public.training_legacy_claim_begin(uuid, text, text) is
  $cmt$ouvre une tentative de réclamation GLA : 4 plafonds + trace, dans une seule transaction verrouillée (cible puis profil) — service-role uniquement$cmt$;

-- ── 5b. claim_settle : marque la tentative et RÉSERVE le couple, après la preuve ────────────
-- La réservation est posée AVANT l'import, pas après : sinon deux profils qui réclament le même
-- login en parallèle importeraient tous les deux ~17 k lignes avant de découvrir le conflit.
create or replace function public.training_legacy_claim_settle(
  p_attempt       uuid,
  p_ok            boolean,
  p_login_display text,
  p_linked_by     uuid default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_att   public.training_legacy_claim_attempts%rowtype;
  v_claim public.training_legacy_claims%rowtype;
  v_other uuid;
begin
  select * into v_att from public.training_legacy_claim_attempts where id = p_attempt;
  if not found then
    raise exception 'LEGACY_ATTEMPT_UNKNOWN' using errcode = 'P0001';
  end if;

  update public.training_legacy_claim_attempts set ok = p_ok where id = p_attempt;
  if not p_ok then
    return 'failed';
  end if;

  -- Mêmes verrous, même ordre qu'en 5a.
  perform pg_advisory_xact_lock(hashtext('legacy_login:' || v_att.login_key));
  perform pg_advisory_xact_lock(hashtext('legacy_claim:' || v_att.profile_id::text));

  select * into v_claim from public.training_legacy_claims where profile_id = v_att.profile_id;
  if found then
    if v_claim.login_key <> v_att.login_key then
      -- L'appelant lit login_display sur SA PROPRE ligne (RLS) pour composer le message.
      return 'other_login';
    end if;
    if v_claim.sync_started_at is not null and v_claim.sync_started_at > now() - interval '5 minutes' then
      return 'sync_running';
    end if;
    -- Re-réclamation par le MÊME profil après un détachement : c'est une réparation, pas un vol.
    update public.training_legacy_claims
       set sync_started_at = now(),
           detached_at     = null,
           login_display   = coalesce(nullif(p_login_display, ''), login_display),
           linked_by       = coalesce(p_linked_by, linked_by)
     where profile_id = v_att.profile_id;
    return 'resync';
  end if;

  -- C'est ICI, et NULLE PART AVANT, que l'unicité de la cible est consultée (§3.2) : un pré-check
  -- en tête de handler ruinerait tout le travail anti-énumération de §2.3.
  select profile_id into v_other from public.training_legacy_claims where login_key = v_att.login_key;
  if v_other is not null then
    return 'taken';
  end if;

  begin
    insert into public.training_legacy_claims (profile_id, login_key, login_display, sync_started_at, linked_by)
    values (v_att.profile_id, v_att.login_key, coalesce(nullif(p_login_display, ''), v_att.login_key), now(), p_linked_by);
  exception
    -- Course entre la lecture et l'écriture : une autre réclamation a pu prendre la place
    -- (patron lib/chatter-link.ts:31-50). Les verrous la rendent improbable, pas impossible.
    when unique_violation then
      return 'taken';
  end;
  return 'new';
end;
$$;

revoke all on function public.training_legacy_claim_settle(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.training_legacy_claim_settle(uuid, boolean, text, uuid) to service_role;
comment on function public.training_legacy_claim_settle(uuid, boolean, text, uuid) is
  $cmt$règle une tentative et RÉSERVE le couple profil ↔ login (avant l'import). Rend new|resync|failed|taken|other_login|sync_running — un refus est un code de retour, pas une exception, pour que la trace ok=true survive$cmt$;

-- ── 5c. refresh_all : un SEUL aller-retour pour recalculer tous les agrégats ────────────────
-- Le trigger `trg_training_session_scored` est un AFTER UPDATE : un INSERT ne le déclenche JAMAIS.
-- Insérer 16 500 lignes `status='scored'` produit 0 déclenchement — `training_case_bests` et
-- `training_profile_stats` restent vides, et Ma formation affiche zéro malgré 16 k sessions.
-- La boucle reste dans Postgres : chaque `rpc()` supabase-js est un aller-retour HTTP distinct, et
-- chaque `training_refresh_stats` refait un count(distinct …) sur TOUTES les sessions du profil.
-- 150 allers-retours séquentiels feraient sauter le budget de temps de la Server Action.
create or replace function public.training_legacy_refresh_all(p_profile uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r     record;
  v_n   integer := 0;
begin
  if p_profile is null then
    return 0;
  end if;
  -- Ordre déterministe (par max(scored_at) croissant) : ça ne suffit pas à réparer le streak
  -- (§3.7 — un UPDATE dédié s'en charge après), mais ça évite d'ajouter de l'aléa.
  for r in
    select case_id, max(scored_at) as at
      from public.training_sessions
     where profile_id = p_profile and status = 'scored' and total is not null
     group by case_id
     order by max(scored_at) asc
  loop
    perform public.training_refresh_stats(p_profile, r.case_id, coalesce(r.at, now()));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.training_legacy_refresh_all(uuid) from public, anon, authenticated;
grant execute on function public.training_legacy_refresh_all(uuid) to service_role;
comment on function public.training_legacy_refresh_all(uuid) is
  $cmt$recalcule training_case_bests / training_profile_stats pour TOUS les couples (profil, cas) d'un profil, en un seul aller-retour — le trigger de notation est un AFTER UPDATE, un import par INSERT ne le déclenche jamais$cmt$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 6) Le seul geste D6 qui reste : le classement hebdo ignore l'historique repris
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Reprise À L'IDENTIQUE de la définition EN VIGUEUR (0113_formation.sql:1778, section [ex-0124] —
-- vérifiée par pg_get_functiondef en UAT), avec la seule addition de `and s.legacy_id is null`.
-- Les clauses `'frm-entrainement' = any(p.pages)` et la clause de visibilité sont indispensables :
-- les retirer par inadvertance reclasserait des profils sans droit Entraînement.
--
-- POURQUOI ce filtre, alors que 0122 a supprimé tout octroi automatique : dans le modèle « le tour
-- est DONNÉ », c'est l'écran que l'encadrant regarde pour décider à qui donner un tour. Un chatter
-- qui importe 400 sessions apparaîtrait en tête d'un classement qu'il n'a pas disputé chez nous, et
-- l'encadrant paierait — par la main, ce que la base ne paie plus.
--
-- Ce qui n'est PAS filtré, et c'est voulu (D4) : `training_refresh_stats`, `training_module_ranking`
-- (0119) et l'Overview des encadrants. L'historique repris DOIT compter dans la progression — c'est
-- toute la raison d'être de la reprise. Seul ce qui DÉCIDE d'un versement est filtré.
create or replace function public.training_weekly_ranking(p_week date)
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
language sql stable security definer set search_path = public, pg_temp
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
      and s.legacy_id is null
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  )
  select b.profile_id, coalesce(p.display_name, '—'), sum(b.best_total)::integer, count(*)::integer,
         round(avg(b.best_total), 2)
  from best b
  join profiles p on p.id = b.profile_id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and ((select public.is_admin()) or (select public.has_page('formation')))
  group by b.profile_id, p.display_name
  order by 3 desc, 5 desc, min(b.first_at) asc;
$$;

revoke execute on function public.training_weekly_ranking(date) from public, anon;
grant execute on function public.training_weekly_ranking(date) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 7) Journal du membre : un kind 'formation', surtout PAS 'lien'
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- `'lien'` n'est pas un lien générique : c'est LE lien MyPuls, celui qui impute le CA donc la paie.
-- Une réclamation GLA afficherait « Lien MyPuls : Lié à la fiche MyPuls axel93 » dans le journal
-- admin et polluerait l'historique du lien de paie.
--
-- Et `member_events` n'est pas écrite depuis l'app (0101:118-119 : « alimentée EXCLUSIVEMENT par
-- trigger — la table ne vaut que si elle est exhaustive »). D'où le trigger ci-dessous : l'app
-- écrit `training_legacy_claims`, le journal suit tout seul.
alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction','rapport','recompense','formation'));

create or replace function public.training_legacy_claim_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
begin
  -- Garde-fou (patron 0106:47-51) : si le profil n'existe plus (suppression en cascade), pas
  -- d'événement — la FK de member_events refuserait l'insert et ferait échouer le DELETE lui-même.
  if not exists (select 1 from profiles where id = v_profile) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- `created_by` = l'acteur réel : l'admin qui a rattaché (D7), ou le chatter lui-même en
  -- auto-réclamation. `auth.uid()` serait toujours null — ces écritures sont en service-role.
  if tg_op = 'DELETE' then
    insert into member_events (profile_id, created_by, kind, from_value)
    values (old.profile_id, old.linked_by, 'formation',
            'Ancienne plateforme : identifiant ' || old.login_display || ' libéré');
    return old;
  elsif tg_op = 'INSERT' then
    insert into member_events (profile_id, created_by, kind, to_value)
    values (new.profile_id, coalesce(new.linked_by, new.profile_id), 'formation',
            'Ancienne plateforme : rattaché à ' || new.login_display);
  elsif new.detached_at is not null and old.detached_at is null then
    insert into member_events (profile_id, created_by, kind, from_value)
    values (new.profile_id, coalesce(new.linked_by, new.profile_id), 'formation',
            'Ancienne plateforme : détaché de ' || new.login_display);
  elsif new.last_sync_at is not null and new.last_sync_at is distinct from old.last_sync_at then
    -- to_value lisible SANS jointure (patron training_wheel_spin_journal, 0113:1661).
    insert into member_events (profile_id, created_by, kind, to_value)
    values (new.profile_id, coalesce(new.linked_by, new.profile_id), 'formation',
            'Ancienne plateforme : historique repris de ' || new.login_display
            || ' — ' || new.sessions_count || ' sessions');
  end if;
  return new;
end;
$$;

revoke all on function public.training_legacy_claim_journal() from public;

drop trigger if exists trg_training_legacy_claim_journal on public.training_legacy_claims;
create trigger trg_training_legacy_claim_journal
  after insert or delete or update of last_sync_at, detached_at on public.training_legacy_claims
  for each row execute function public.training_legacy_claim_journal();
