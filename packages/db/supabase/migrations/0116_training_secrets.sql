-- 0116 — Secrets du catalogue de formation en tables ADMIN SEUL (revue finale du Catalogue,
-- 2026-08-18). La RLS 0113 est par ligne : tout membre ayant le droit de face `formation`
-- pouvait lire fan_brief / expected / scoring_notes / champs cachés des fans via PostgREST.
-- On DÉPLACE ces colonnes dans trois tables miroirs lisibles/écrites par les admins seulement ;
-- le moteur IA (lib/ai, serveur) les lit avec le client service-role. Données recopiées puis
-- colonnes sources supprimées (la 0115 — seed — reste telle quelle : c'est cette migration qui
-- transporte ses données).

create table public.training_case_secrets (
  case_id   uuid primary key references public.training_cases(id) on delete cascade,
  fan_brief text,   -- consigne du fan pour l'IA (solo) — jamais montrée au chatter
  expected  text    -- « ce qui était attendu » (solo) — révélé APRÈS la notation
);
create table public.training_module_secrets (
  module_id     uuid primary key references public.training_modules(id) on delete cascade,
  scoring_notes text  -- consigne de notation transmise à l'IA
);
create table public.training_boss_fan_secrets (
  fan_id         uuid primary key references public.training_case_boss_fans(id) on delete cascade,
  budget_cap     integer check (budget_cap >= 0),
  nego_threshold integer check (nego_threshold >= 0),
  nego_where     text,
  meet_when      text,
  meet_where     text,
  derails        text
);

-- Copie des données (0113 + seed 0115).
insert into public.training_case_secrets (case_id, fan_brief, expected)
select id, fan_brief, expected from public.training_cases
where fan_brief is not null or expected is not null;
insert into public.training_module_secrets (module_id, scoring_notes)
select id, scoring_notes from public.training_modules where scoring_notes is not null;
insert into public.training_boss_fan_secrets (fan_id, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails)
select id, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails
from public.training_case_boss_fans;

-- Colonnes sources : le check solo référençait fan_brief/expected → recréé sur fan_name seul
-- (fan_brief/expected restent obligatoires pour un solo CÔTÉ ACTION, cf. Zod caseForm).
alter table public.training_cases drop constraint training_cases_solo_fields;
alter table public.training_cases drop column fan_brief, drop column expected;
alter table public.training_cases add constraint training_cases_solo_fields
  check ((kind = 'solo') = (fan_name is not null));
alter table public.training_modules drop column scoring_notes;
alter table public.training_case_boss_fans
  drop column budget_cap, drop column nego_threshold, drop column nego_where,
  drop column meet_when, drop column meet_where, drop column derails;

alter table public.training_case_secrets enable row level security;
alter table public.training_module_secrets enable row level security;
alter table public.training_boss_fan_secrets enable row level security;

create policy training_case_secrets_admin on public.training_case_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_module_secrets_admin on public.training_module_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_boss_fan_secrets_admin on public.training_boss_fan_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
