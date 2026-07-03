-- Historique durable des runs d'ingestion (watcher) : une ligne par run, insérée par la
-- clé service-role (bypass RLS). Les Workers Logs Cloudflare (plan Free) ne gardent que
-- 3 jours — cette table est la source consultable long terme (et affichable dans le
-- dashboard plus tard). `summary` = IngestRunSummary (@glagency/core) sérialisé.

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'degraded', 'failed')),
  triggered_by text not null check (triggered_by in ('cron', 'http', 'local')),
  summary jsonb not null default '{}'::jsonb,
  error text
);

create index ingest_runs_started_at_idx on public.ingest_runs (started_at desc);

-- Même modèle RLS que le reste du schéma (cf. 0004) : lecture authentifiée, aucune
-- écriture côté web (l'ingestion écrit en service-role).
alter table public.ingest_runs enable row level security;
create policy ingest_runs_auth_read on public.ingest_runs for select to authenticated using (true);
