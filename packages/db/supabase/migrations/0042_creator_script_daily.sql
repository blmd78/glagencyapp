-- 0042 — Snapshot quotidien des scripts MyPuls par modèle (page /scripts).
-- MyPuls n'expose que des stats CUMULÉES depuis toujours : on snapshote chaque nuit
-- (greffé sur la mini-invocation du fan-out spenders) et on dérive les deltas jour
-- (même mécanique que les cumuls marketing, 0019). `date` = jour clos (veille du run).
create table if not exists creator_script_daily (
  creator_id uuid not null references creators(id) on delete cascade,
  script_id bigint not null,
  date date not null,
  name text not null default '',
  -- Numéro du script (badge « N°x » MyPuls) — null si le script a disparu des cartes.
  sequence int,
  position int,
  active boolean not null default true,
  msg_count int not null default 0,
  media_count int not null default 0,
  price_total numeric not null default 0,
  -- Cumuls MyPuls au moment du snapshot (depuis toujours).
  sends_cum int not null default 0,
  unique_fans_cum int not null default 0,
  sales_cum int not null default 0,
  revenue_cum numeric not null default 0,
  -- Deltas vs snapshot précédent. NULL = premier snapshot (delta inconnu, à exclure des sommes).
  sales_day int,
  revenue_day numeric,
  captured_at timestamptz not null default now(),
  primary key (creator_id, script_id, date)
);

create index if not exists creator_script_daily_creator_date_idx
  on creator_script_daily (creator_id, date);

alter table creator_script_daily enable row level security;

-- Lecture cloisonnée comme creator_daily : admin ou modèle assigné.
-- Aucune policy d'écriture → écritures via service-role uniquement (worker d'ingestion).
create policy creator_script_daily_scoped_read on creator_script_daily for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = creator_script_daily.creator_id));
