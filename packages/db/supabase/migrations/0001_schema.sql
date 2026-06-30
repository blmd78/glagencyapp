-- 0001_schema.sql — schéma initial (dimensions + faits + insights + état éditable)
-- Modèle : grain JOUR pour l'argent/abonnements, grain PÉRIODE pour présence/réactivité.

-- ── Enums ───────────────────────────────────────────────────────────────────
create type chatter_role     as enum ('setter','closer','sous_manager','volant','trainee');
create type app_role         as enum ('admin','manager','member');
create type insight_scope    as enum ('month','week','day');
create type insight_severity as enum ('critical','warning','opportunity','insight','notable','ok');
create type insight_status   as enum ('open','in_progress','resolved','ignored','kept');

-- ── Dimensions ──────────────────────────────────────────────────────────────
create table creators (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,            -- = nom d'équipe / modèle
  mypuls_creator_id  text unique,
  is_secondary       boolean not null default false,
  primary_creator_id uuid references creators(id) on delete set null,
  excluded           boolean not null default false,  -- hors CA/LTV (comptes privés/VIP)
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table chatters (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  mypuls_user_id text unique,
  creator_id     uuid references creators(id) on delete set null,  -- équipe courante
  role           chatter_role,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (name, email)
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         app_role not null default 'member',
  display_name text,
  created_at   timestamptz not null default now()
);

-- modèles visibles par un manager/member (admin ⇒ tout)
create table profile_creators (
  profile_id uuid references profiles(id)  on delete cascade,
  creator_id uuid references creators(id)  on delete cascade,
  primary key (profile_id, creator_id)
);

-- ── Faits — grain JOUR ──────────────────────────────────────────────────────
create table chatter_daily (
  chatter_id uuid not null references chatters(id) on delete cascade,
  date       date not null,
  ca         numeric(12,2) not null default 0,
  ca_ppv     numeric(12,2) not null default 0,
  ca_tips    numeric(12,2) not null default 0,
  propose    integer not null default 0,
  vendu      integer not null default 0,
  primary key (chatter_id, date)
);

create table creator_daily (
  creator_id  uuid not null references creators(id) on delete cascade,
  date        date not null,
  ca          numeric(12,2) not null default 0,
  subs_active integer not null default 0,
  new_subs    integer not null default 0,
  primary key (creator_id, date)
);

-- ── Faits — grain PÉRIODE (hybride : métriques non dispo au jour côté MyPuls) ─
create table chatter_period_stats (
  chatter_id          uuid not null references chatters(id) on delete cascade,
  period_start        date not null,
  period_end          date not null,
  presence_active_min integer not null default 0,
  presence_idle_min   integer not null default 0,
  reactivite_sec      integer,
  taux_conv           numeric(5,2),
  primary key (chatter_id, period_start, period_end)
);

-- ── Insights (générés par l'ingestion — moteur de règles) ───────────────────
create table insights (
  id             text primary key,               -- id stable / déterministe
  scope          insight_scope not null,
  creator_id     uuid references creators(id) on delete cascade,  -- null = global
  severity       insight_severity not null,
  category       text not null,
  title          text not null,
  body           text,
  recommendation text,
  icon           text,
  data_points    jsonb,
  period_start   date,
  period_end     date,
  generated_at   timestamptz not null default now(),
  age_days       integer not null default 0
);
create index insights_scope_idx   on insights (scope);
create index insights_creator_idx on insights (creator_id);

-- ── État éditable ───────────────────────────────────────────────────────────
create table insight_states (
  insight_id text primary key,                    -- référence logique → insights.id
  status     insight_status not null default 'open',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

create table bilans (                             -- RH / disciplinaire
  id         uuid primary key default gen_random_uuid(),
  insight_id text,
  chatter_id uuid references chatters(id) on delete set null,
  date       date,
  duree      text,
  etat       text,
  resume     text,
  actions    text,
  objectifs  text,
  sanction   text,
  next_check date,
  notes      text,
  history    jsonb not null default '[]'::jsonb,
  saved_at   timestamptz not null default now(),
  saved_by   uuid references profiles(id) on delete set null
);

create table quotas (                             -- seuils par modèle
  creator_id      uuid primary key references creators(id) on delete cascade,
  presence_h      numeric(5,2),
  reactivite_s    integer,
  medias_proposes integer,
  conv_pct        numeric(5,2),
  ca_eur          numeric(12,2),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null
);

create table transfers (                          -- réaffectation d'équipe
  chatter_id      uuid primary key references chatters(id) on delete cascade,
  from_creator_id uuid references creators(id) on delete set null,
  to_creator_id   uuid references creators(id) on delete set null,
  date            date not null default current_date,
  created_by      uuid references profiles(id) on delete set null
);

-- ── Compta / paie (sensible — admin-only via RLS) ───────────────────────────
create table payroll_config (
  scope      text not null,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);
