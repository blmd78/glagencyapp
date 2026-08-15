-- 0109 — Stockage du cookie de session MyPuls, auto-renouvelé par le worker d'ingestion.
--
-- CONTEXTE : depuis ~2026-08-12, MyPuls protège /login par un CAPTCHA Turnstile → le login
-- par mot de passe est mort. L'auth passe désormais par un cookie « remember me » obtenu par
-- un login humain. Ce cookie est GLISSANT : à chaque usage via le flow remember-me, MyPuls
-- réémet un REMEMBERME dont l'expiration est repoussée de 7 jours. Le worker s'en sert pour
-- s'auto-renouveler : à chaque run il se ré-authentifie via le REMEMBERME stocké, capture le
-- cookie frais (PHPSESSID + REMEMBERME) et le RÉÉCRIT ici. Tant que le cron tourne au moins
-- une fois tous les 7 jours (il tourne chaque nuit), la session ne meurt jamais.
--
-- Pourquoi une table et pas un secret Cloudflare : un secret wrangler est FIGÉ (le worker ne
-- peut pas se réécrire un secret) — il faut un stockage mutable côté serveur. Le .env / le
-- secret ne servent plus qu'à l'AMORÇAGE initial (première ligne semée par le worker).
--
-- SÉCURITÉ : contenu = secret d'accès au compte MyPuls. RLS ACTIVÉE SANS AUCUNE POLICY →
-- deny-all pour anon / authenticated ; seul le service-role (createAdminClient, BYPASS RLS)
-- lit/écrit. Jamais exposée à l'UI ni au client navigateur.
create table if not exists ingest_session (
  id text primary key,
  cookie text not null,
  refreshed_at timestamptz not null default now()
);

alter table ingest_session enable row level security;

comment on table ingest_session is
  'Cookie de session MyPuls auto-renouvelé (remember-me glissant) — worker ingestion, service-role only (0109).';
