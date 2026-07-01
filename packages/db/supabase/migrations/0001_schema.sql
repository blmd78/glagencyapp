-- 0001 — Socle : dimensions + faits jour (source = scrape MyPuls).
-- Discipline cardinale : on stocke UNIQUEMENT des faits au grain le plus fin.
-- Tout agrégat/dérivé (com, taux_conv, evolution, %, LTV...) = calculé en SQL, JAMAIS stocké.
-- Config (quotas, insights, bilans...) + RLS + fonctions : migrations suivantes.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- email insensible à la casse

create type app_role as enum ('admin', 'manager', 'member');

-- ─────────────────────────── DIMENSIONS ───────────────────────────

-- Équipe de management (lead : Carla, Sarah, Mathilde...). Porte les quotas.
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  lead_name  text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Modèle / compte OF. is_private : compté mais isolable (décision : on garde tout).
create table creators (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                  -- affichage (instable) ; clé = mypuls_creator_id
  mypuls_creator_id  text unique,
  team_id            uuid references teams(id) on delete set null,
  is_secondary       boolean not null default false,
  primary_creator_id uuid references creators(id) on delete set null,
  is_private         boolean not null default false,   -- carlaprive/juliepvv/alice_prvv (comptés, flaggés)
  excluded           boolean not null default false,   -- vrais exclus (test), hors CA
  excluded_reason    text,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on creators(team_id);
create index on creators(primary_creator_id);

-- Chatteur (agent). Clé canonique = mypuls_user_id / email, JAMAIS le name instable.
create table chatters (
  id                uuid primary key default gen_random_uuid(),
  mypuls_user_id    text unique,
  email             citext,
  display_name      text not null,
  team_id           uuid references teams(id) on delete set null,
  role              text,                               -- enum non figé (valeurs à confirmer)
  active            boolean not null default true,
  access_revoked    boolean not null default false,
  config_updated_at timestamptz,
  created_at        timestamptz not null default now()
);
create unique index on chatters(email) where email is not null;
create index on chatters(team_id);

-- Réconciliation d'identité : libellé brut (pseudo/email/casse/emoji/suffixe) -> chatteur.
create table chatter_alias (
  id             uuid primary key default gen_random_uuid(),
  chatter_id     uuid not null references chatters(id) on delete cascade,
  raw_label      text not null unique,               -- dédoublonne les libellés identiques
  raw_label_norm text not null,                       -- PAS unique : 2 personnes peuvent collisionner après norm
  source         text not null check (source in ('csv_money','csv_reach','scrape','api','manual')),
  created_at     timestamptz not null default now()
);
create index on chatter_alias(chatter_id);
create index on chatter_alias(raw_label_norm);

-- Affectation N-N chatteur <-> modèle (multi-modèles).
create table chatter_creators (
  chatter_id uuid not null references chatters(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  role       text,
  active     boolean not null default true,
  is_manual  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (chatter_id, creator_id)
);
create index on chatter_creators(creator_id);

-- ─────────────────────────── AUTH / RBAC ───────────────────────────

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         app_role not null default 'member',
  display_name text,
  created_at   timestamptz not null default now()
);

-- Cloisonnement de visibilité par modèle (base des policies RLS).
create table profile_creators (
  profile_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  primary key (profile_id, creator_id)
);
create index on profile_creators(creator_id);

-- ─────────────────────────── FAITS JOUR (immuables) ───────────────────────────

-- (chatteur, jour) TOUS MODÈLES. Source de vérité argent+présence+réactivité+volume.
create table chatter_daily (
  chatter_id        uuid not null references chatters(id) on delete restrict,
  date              date not null,
  ca                numeric(12,2) not null default 0,
  ca_ppv            numeric(12,2) not null default 0 check (ca_ppv >= 0),
  ca_tips           numeric(12,2) not null default 0 check (ca_tips >= 0),
  propose           integer not null default 0 check (propose >= 0),
  vendu             integer not null default 0 check (vendu >= 0),   -- PAS de check vendu<=propose
  presence_active_h numeric(5,2) not null default 0 check (presence_active_h >= 0),
  presence_idle_h   numeric(5,2) not null default 0 check (presence_idle_h >= 0),
  reactivite_sec    integer check (reactivite_sec is null or reactivite_sec >= 0),
  primary key (chatter_id, date),
  check (abs(ca - (ca_ppv + ca_tips)) <= 0.01)   -- tolérance arrondi (proration)
);
create index on chatter_daily(date);

-- (chatteur, jour) reach : audience + charge. Source = daily_fans_distincts.
create table chatter_daily_reach (
  chatter_id     uuid not null references chatters(id) on delete restrict,
  date           date not null,
  messages       integer not null default 0 check (messages >= 0),
  mots           integer not null default 0 check (mots >= 0),
  fans_distincts integer not null default 0 check (fans_distincts >= 0),
  ppv_proposes   integer not null default 0 check (ppv_proposes >= 0),
  primary key (chatter_id, date)
);
create index on chatter_daily_reach(date);

-- (chatteur, modèle, jour) : ventilation du CA par modèle (multi-modèles).
-- Invariant vérifié à l'ingestion : Σ creator_id = chatter_daily pour (chatter, jour).
create table chatter_creator_daily (
  chatter_id uuid not null references chatters(id) on delete restrict,
  creator_id uuid not null references creators(id) on delete restrict,
  date       date not null,
  ca         numeric(12,2) not null default 0,
  ca_ppv     numeric(12,2) not null default 0 check (ca_ppv >= 0),
  ca_tips    numeric(12,2) not null default 0 check (ca_tips >= 0),
  propose    integer not null default 0 check (propose >= 0),
  vendu      integer not null default 0 check (vendu >= 0),
  primary key (chatter_id, creator_id, date),
  check (abs(ca - (ca_ppv + ca_tips)) <= 0.01)   -- tolérance arrondi (proration)
);
create index on chatter_creator_daily(creator_id, date);
create index on chatter_creator_daily(date);

-- (modèle, jour) : compte OF. ca (total) >= ppv+tips+renew (delta = 'autres', pas d'égalité stricte).
create table creator_daily (
  creator_id  uuid not null references creators(id) on delete restrict,
  date        date not null,
  ca          numeric(12,2) not null default 0 check (ca >= 0),
  ca_ppv      numeric(12,2) not null default 0 check (ca_ppv >= 0),
  ca_tips     numeric(12,2) not null default 0 check (ca_tips >= 0),
  ca_renew    numeric(12,2) not null default 0 check (ca_renew >= 0),
  subs_active integer not null default 0 check (subs_active >= 0),
  new_subs    integer not null default 0 check (new_subs >= 0),
  primary key (creator_id, date)
);
create index on creator_daily(date);

-- ─────────────────────────── ROLLUP (fige le non-recalculable) ───────────────────────────

create table period_snapshot_kpi (
  last_update        timestamptz primary key,
  period_start       date not null,
  period_end         date not null check (period_end >= period_start),
  period_prev_start  date not null,
  period_prev_end    date not null,
  week_start         date not null,
  week_end           date not null,
  current_week_start date not null,
  current_week_end   date not null,
  current_week_days  smallint not null check (current_week_days between 0 and 7),
  period_days        smallint not null,
  total_ca           numeric(14,2) not null,
  total_ca_prev      numeric(14,2) not null,   -- NON recalculable -> figé
  n_active           integer not null,
  n_inactive         integer not null,
  max_missed_shifts  integer not null default 0,
  source             text not null,
  sheet_used         text not null
);
create unique index on period_snapshot_kpi(period_start, period_end);
