-- 0161 — Limite d'essais par exercice, et essais redonnés par un manager.
--
-- Demande de Benoit et Gourou, 2026-09-14 : « 3 essais par exercice ; s'il rejoue 10 fois c'est
-- qu'il n'a pas compris — un manager vient lui expliquer et lui redonne des essais ». Mesure du
-- 1er au 14/09 : 80,8 % du coût IA de l'entraînement venait des rejeux. Spec :
-- docs/superpowers/specs/2026-09-14-limite-essais-design.md
--
-- ADDITIVE : une colonne à défaut, une table, une fonction. Le code déjà en production n'en lit
-- aucune — la migration peut précéder le déploiement.

-- 1. Le maximum d'essais d'un exercice, réglable exercice par exercice dans le Catalogue.
alter table public.training_cases
  add column if not exists max_attempts smallint not null default 3
    constraint training_cases_max_attempts_check check (max_attempts between 1 and 50);

comment on column public.training_cases.max_attempts is
  'Essais par chatteur sur cet exercice (0161). Un essai = une session terminée : scored, failed, ou abandoned sans thread ouvert (défi/boss expiré). Les essais redonnés par un manager s''ajoutent (training_attempt_grants).';

-- 2. Les essais redonnés — chaque ligne EST la trace : qui, quand, combien, pour qui, sur quoi.
create table if not exists public.training_attempt_grants (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  case_id     uuid not null references public.training_cases(id) on delete cascade,
  extra       smallint not null constraint training_attempt_grants_extra_check check (extra between 1 and 20),
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists training_attempt_grants_profile_case_idx
  on public.training_attempt_grants (profile_id, case_id);
create index if not exists training_attempt_grants_case_id_idx
  on public.training_attempt_grants (case_id);
create index if not exists training_attempt_grants_granted_by_idx
  on public.training_attempt_grants (granted_by);

-- Lecture : l'intéressé, l'encadrement de la Formation (`frm-suivi`), les admins. AUCUNE politique
-- d'écriture : les déblocages passent par une Server Action en service-role après garde, comme le
-- reste de la Formation (0121).
alter table public.training_attempt_grants enable row level security;

drop policy if exists training_attempt_grants_read on public.training_attempt_grants;
create policy training_attempt_grants_read on public.training_attempt_grants
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.has_page('frm-suivi'))
  );

-- 3. Essais consommés et redonnés, par exercice, pour un chatteur.
--
-- SECURITY INVOKER : elle lit ce que l'appelant a le droit de lire (ses propres sessions, ou
-- celles d'un chatteur pour l'encadrement `frm-suivi`). Hors reprise GLA (`legacy_id`), comme la
-- roue des modules. Un abandon MANUEL laissait ses threads `open` : il ne compte pas — c'était
-- permis avant 0161. Un défi/boss fermé par `expireSession` a tous ses threads `lost` : il compte.
create or replace function public.training_attempts(p_profile uuid)
returns table (case_id uuid, used integer, granted integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with used as (
    select s.case_id, count(*)::integer as used
    from training_sessions s
    where s.profile_id = p_profile
      and s.legacy_id is null
      and (
        s.status in ('scored', 'failed')
        or (s.status = 'abandoned'
            and not exists (select 1 from training_threads t where t.session_id = s.id and t.status = 'open'))
      )
    group by s.case_id
  ),
  granted as (
    select g.case_id, sum(g.extra)::integer as granted
    from training_attempt_grants g
    where g.profile_id = p_profile
    group by g.case_id
  )
  select coalesce(u.case_id, g.case_id), coalesce(u.used, 0), coalesce(g.granted, 0)
  from used u
  full join granted g on g.case_id = u.case_id
$$;

revoke all on function public.training_attempts(uuid) from public;
grant execute on function public.training_attempts(uuid) to authenticated;

comment on function public.training_attempts(uuid) is
  'Essais par exercice d''un chatteur (0161) : used = sessions terminées hors reprise GLA (scored, failed, abandoned sans thread ouvert), granted = somme des essais redonnés. Security invoker.';
