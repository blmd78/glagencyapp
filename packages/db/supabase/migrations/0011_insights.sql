-- 0011 — Insights hebdo « Quotas » (spec 2026-07-03) : cartes générées HISTORISÉES
-- (une insertion par génération, PK versionnée) + états de traitement ancrés sur la
-- clé stable (survivent aux régénérations nocturnes).

create table insights (
  insight_key  text not null,                 -- quotas_<weekStart>_<chatterId>
  generated_at timestamptz not null default now(),
  week_start   date not null,
  severity     text not null check (severity in ('critical','warning')),
  chatter_id   uuid not null references chatters(id) on delete cascade,
  title        text not null,
  body         text not null,
  action_plan  text not null,
  kpis         jsonb not null default '[]',   -- chips globales [{label,value,target,ok}]
  models       jsonb not null default '[]',   -- split par modèle [{name,days,ca,expected,pct,weekDays,weekCa,weekExpected}]
  primary key (insight_key, generated_at)
);
create index on insights (week_start);
create index on insights (chatter_id);

create table insight_states (
  insight_key text primary key,               -- la clé stable, PAS la version
  status      text not null default 'new' check (status in ('new','in_progress','resolved','ignored')),
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

-- v1 : la carte agrège des données tous-modèles (chips globales) → admin uniquement,
-- lecture ET écriture des états. Déclinaison par-modèle pour les rôles user = v2.
alter table insights enable row level security;
alter table insight_states enable row level security;
create policy insights_admin_read on insights
  for select to authenticated using (public.is_admin());
create policy insight_states_admin_read on insight_states
  for select to authenticated using (public.is_admin());
create policy insight_states_admin_insert on insight_states
  for insert to authenticated with check (public.is_admin());
create policy insight_states_admin_update on insight_states
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
