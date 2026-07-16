-- 0018 — Pôle MARKETING (remplace le stack VPS mypuls : scraper Python + Discord + page HTML).
-- Domaine préfixé mkt_* (même convention que compta_*/rest_planning_* — un préfixe par pôle,
-- le futur 3e pôle suivra le même patron).
-- Sources : liens de tracking MyPuls (session web, comme l'ingestion chatteurs), comptes
-- sociaux (Apify pour Instagram, API tierce pour X), staff/payes (config interne).
-- RLS : admin-only pour tout le pôle en v1 (rémunérations sensibles) — les policies passent
-- par has_page('marketing') OU admin, pour pouvoir accorder la page à un manager plus tard.

-- ── Staff marketing (VAs + manager) — fiches internes, PAS des utilisateurs de l'app.
create table mkt_staff (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  role           text not null default 'va' check (role in ('va', 'manager')),
  color          text not null default '#6c63ff',
  fixed_eur      numeric(10,2) not null default 0,   -- fixe mensuel (proraté à la période)
  rate_tw        numeric(10,4) not null default 0,   -- €/sub converti via SES liens MyPuls
  rate_ig        numeric(10,4) not null default 0,   -- €/1k vues de SES comptes Instagram
  bonus_eur      numeric(10,2) not null default 0,   -- prime exceptionnelle (proratée)
  pct            numeric(5,2)  not null default 0,   -- manager : % du revenu du pôle
  payment_method text not null default 'virement',
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ── Liens de tracking MyPuls.
create table mkt_links (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,             -- nom du lien côté MyPuls (clé de rapprochement)
  type              text not null default 'other' check (type in ('twitter', 'instagram', 'other')),
  url               text not null default '',
  creator_id        uuid references creators(id) on delete set null,
  mypuls_creator_id text,                             -- id MyPuls source (même format que creators)
  created_src       text not null default '',         -- date de création affichée par MyPuls (texte brut)
  active            boolean not null default true,    -- false = lien disparu des scrapes
  created_at        timestamptz not null default now()
);

-- Série journalière par lien — DELTAS (la source expose des cumuls ; l'ingestion dérive).
create table mkt_link_daily (
  link_id     uuid not null references mkt_links(id) on delete cascade,
  date        date not null,
  clicks      integer not null default 0,
  conversions integer not null default 0,
  revenue_eur numeric(12,2) not null default 0,
  primary key (link_id, date)
);
create index mkt_link_daily_date_idx on mkt_link_daily (date);

-- ── Comptes sociaux de la farm (Instagram / X).
create table mkt_social_accounts (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null check (platform in ('instagram', 'twitter')),
  handle     text not null,                            -- avec @ retiré, casse d'origine
  creator_id uuid references creators(id) on delete set null,
  staff_id   uuid references mkt_staff(id) on delete set null,  -- VA assigné (paye IG)
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

-- Relevé journalier par compte (followers = cumul du jour, le reste = fenêtre 24 h).
create table mkt_social_daily (
  account_id      uuid not null references mkt_social_accounts(id) on delete cascade,
  date            date not null,
  followers       integer,
  delta_followers integer,
  views_24h       integer,
  engagement_24h  integer,
  posts_24h       integer,
  status          text,                                -- ok / banni / privé / introuvable…
  primary key (account_id, date)
);
create index mkt_social_daily_date_idx on mkt_social_daily (date);

-- ── Assignation des liens MyPuls aux VAs (paye TW = subs de SES liens × rate_tw).
create table mkt_staff_links (
  staff_id uuid not null references mkt_staff(id) on delete cascade,
  link_id  uuid not null references mkt_links(id) on delete cascade,
  primary key (staff_id, link_id)
);

-- ── RLS : admin OU page `marketing` accordée (has_page() créé en 0016).
alter table mkt_staff enable row level security;
alter table mkt_links enable row level security;
alter table mkt_link_daily enable row level security;
alter table mkt_social_accounts enable row level security;
alter table mkt_social_daily enable row level security;
alter table mkt_staff_links enable row level security;

create policy mkt_staff_all on mkt_staff for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
create policy mkt_links_all on mkt_links for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
create policy mkt_link_daily_all on mkt_link_daily for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
create policy mkt_social_accounts_all on mkt_social_accounts for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
create policy mkt_social_daily_all on mkt_social_daily for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
create policy mkt_staff_links_all on mkt_staff_links for all to authenticated
  using (public.has_page('marketing')) with check (public.has_page('marketing'));
