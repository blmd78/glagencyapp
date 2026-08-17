-- 0113 — Catalogue de formation (reprise de Good Luck Agency) : modules, axes du barème,
-- sections, cas (solo / défi simultané / boss), messages d'ouverture, créneaux de défi, fans
-- du boss. Spec : docs/superpowers/specs/2026-08-17-formation-catalogue-design.md §3.
--
-- Lecture : quiconque a le droit de face `formation` (posé par mergePages dès qu'une page
-- frm-* est cochée) ou admin ; `has_page` exige left_at is null (0102). Écriture : admin
-- uniquement (le Catalogue est adminOnly). Les lignes inactives restent lisibles : le filtre
-- `active` est applicatif (pages Modules) — le Catalogue admin voit tout.
-- Pas de trigger updated_at (convention repo : posé par les actions) ; pas de created_by
-- (donnée d'équipe, l'audit = updated_by) ; pas de jsonb (structure connue) ; pas d'enum.

create table public.training_modules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  title           text not null check (length(title) between 1 and 80),
  emoji           text check (emoji is null or length(emoji) <= 8),
  description     text,
  objective_label text not null default 'Objectif',
  course_md       text,
  scoring_notes   text,
  position        integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);

create table public.training_module_axes (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  name        text not null check (length(name) between 1 and 60),
  description text not null,
  position    integer not null default 0,
  unique (module_id, key)
);

create table public.training_module_sections (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  code        text not null check (code ~ '^[a-z0-9_-]{2,40}$'),
  title       text not null check (length(title) between 1 and 80),
  emoji       text check (emoji is null or length(emoji) <= 8),
  description text,
  position    integer not null default 0,
  unique (module_id, code)
);

-- Trois sortes de cas (GLA : cas « normal », `arena` = défi simultané, `boss_mode`) :
--   solo  : une conversation contre un fan — fan_name / fan_brief / expected obligatoires
--   arena : 5 conversations en parallèle, chacune rejoue un cas SOLO du module sous un autre
--           prénom (training_case_arena_slots)
--   boss  : 5 tunnels complets contre 5 fans riches (training_case_boss_fans)
create table public.training_cases (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.training_modules(id) on delete cascade,
  section_id     uuid references public.training_module_sections(id) on delete set null,
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  kind           text not null default 'solo' check (kind in ('solo', 'arena', 'boss')),
  title          text not null check (length(title) between 1 and 80),
  phase          text not null default '',
  difficulty     smallint not null check (difficulty between 1 and 10),
  -- messages max du chatter : par conversation (solo/arena) ou par fan (boss).
  -- GLA : tours_max (solo), ARENA_CAP=8 (arena), 32 (boss).
  max_turns      smallint not null check (max_turns between 1 and 50),
  -- délai de réponse max en secondes (arena/boss) — GLA reaction_max_s
  reaction_max_s smallint check (reaction_max_s between 10 and 600),
  is_sale        boolean not null default false,
  context        text not null,
  objective      text not null,
  target_line    text,
  fan_name       text check (fan_name is null or length(fan_name) between 1 and 30),
  fan_brief      text,        -- consigne du fan pour l'IA (jamais affichée au chatter)
  expected       text,        -- « ce qui était attendu » — révélé APRÈS la session
  position       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  constraint training_cases_solo_fields check (
    case when kind = 'solo'
      then fan_name is not null and fan_brief is not null and expected is not null
      else fan_name is null and fan_brief is null
    end
  ),
  constraint training_cases_reaction_kind check ((kind = 'solo') = (reaction_max_s is null))
);
-- section_id du même module : vérifié CÔTÉ ACTION (une incohérence n'aurait qu'un effet d'affichage).

-- Défi simultané : chaque créneau rejoue un cas SOLO du même module (vérifié côté action).
create table public.training_case_arena_slots (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.training_cases(id) on delete cascade,
  position     integer not null,
  -- restrict : on ne supprime pas un solo référencé (on ne supprime d'ailleurs jamais de cas)
  ref_case_id  uuid not null references public.training_cases(id) on delete restrict,
  display_name text not null check (length(display_name) between 1 and 30),
  unique (case_id, position)
);

-- Boss final : un fan riche par tunnel. Visibles du chatter : name, age, job, city, color,
-- persona. Cachés (pilotent l'IA) : budget_cap, nego_*, meet_*, derails.
create table public.training_case_boss_fans (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.training_cases(id) on delete cascade,
  position        integer not null,
  code            text not null check (code ~ '^[a-z0-9_-]{2,30}$'),
  name            text not null check (length(name) between 1 and 30),
  age             smallint check (age between 18 and 99),
  job             text,
  city            text,
  color           text check (color ~ '^#[0-9a-fA-F]{6}$'),
  persona         text not null,
  opening_message text not null,
  budget_cap      integer check (budget_cap >= 0),
  nego_threshold  integer check (nego_threshold >= 0),
  nego_where      text,
  meet_when       text,
  meet_where      text,
  derails         text,
  unique (case_id, position),
  unique (case_id, code)
);

-- Messages d'ouverture (GLA seed) — la conversation « déjà entamée » à l'arrivée du chatter.
create table public.training_case_messages (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid not null references public.training_cases(id) on delete cascade,
  position  integer not null,
  speaker   text not null check (speaker in ('creator', 'fan')),
  body      text not null check (length(body) between 1 and 1000),
  unique (case_id, position)
);

-- Index (FK non couvertes par un unique en tête).
create index training_cases_module_position_idx on public.training_cases (module_id, position);
create index training_cases_section_idx on public.training_cases (section_id);
create index training_case_arena_slots_ref_idx on public.training_case_arena_slots (ref_case_id);
-- axes/sections (module_id, …), messages/slots/fans (case_id, …) : couverts par leur unique.

alter table public.training_modules enable row level security;
alter table public.training_module_axes enable row level security;
alter table public.training_module_sections enable row level security;
alter table public.training_cases enable row level security;
alter table public.training_case_messages enable row level security;
alter table public.training_case_arena_slots enable row level security;
alter table public.training_case_boss_fans enable row level security;

create policy training_modules_read on public.training_modules for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_modules_admin_write on public.training_modules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_module_axes_read on public.training_module_axes for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_axes_admin_write on public.training_module_axes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_module_sections_read on public.training_module_sections for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_sections_admin_write on public.training_module_sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_cases_read on public.training_cases for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_cases_admin_write on public.training_cases for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_messages_read on public.training_case_messages for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_messages_admin_write on public.training_case_messages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_arena_slots_read on public.training_case_arena_slots for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_arena_slots_admin_write on public.training_case_arena_slots for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_boss_fans_read on public.training_case_boss_fans for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_boss_fans_admin_write on public.training_case_boss_fans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
