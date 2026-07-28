-- 0089 — RPC `distinct on` pour le dernier relevé antérieur par compte (mkt_social_daily).
--
-- Remplace le fetchAll ajouté par le fix anti-troncature pour CE cas précis :
-- marketing-social.ts (delta followers + delta vues) ne garde qu'UNE ligne par compte, la
-- plus récente avant la date du run (« premier vu = plus récent », ordre `date desc`). Le
-- fetchAll rapatriait TOUT l'historique (`.in('account_id', …).lt('date', date)` sans
-- plancher) par pages de 1000 lignes pour ne finalement en garder qu'une par compte.
--
-- Budget sous-requêtes du Worker Cloudflare (plan Free, 50/invocation) : le poll de l'actor
-- Apify en consomme déjà ~40 (cf. l'en-tête de marketing-social.ts). Un fetchAll paginé
-- coûte ceil(N/1000) sous-requêtes selon la taille de l'historique accumulé — au fil des
-- mois ça mordra sur le budget restant. Un `distinct on` en base coûte 1 SEULE
-- sous-requête, sémantique strictement identique.
--
-- SECURITY INVOKER (convention repo, docs/guidelines-data-loading.md) : l'appelant est le
-- service role de l'ingestion (créé par createAdminClient(), packages/db/src/admin.ts), qui
-- lit déjà tout mkt_social_daily sans filtre RLS — invoker n'élargit donc rien ici, on suit
-- juste la convention plutôt que d'introduire un premier SECURITY DEFINER pour ce cas.
create or replace function public.mkt_social_prev_snapshot(account_ids uuid[], before_date date)
returns table (account_id uuid, followers integer, views_total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (account_id) account_id, followers, views_total
  from mkt_social_daily
  where account_id = any(account_ids) and date < before_date
  order by account_id, date desc
$$;

-- Fonction interne à l'ingestion seule (aucun appel depuis le web / un rôle authenticated) :
-- pas de `grant execute … to authenticated` comme les RPC `*_report`. Leçon de 0088 : les
-- default privileges du projet Supabase donnent quand même EXECUTE à anon/authenticated à
-- la création d'une fonction (grants explicites, pas hérités de PUBLIC) → on les révoque
-- ici. Seul `service_role` (grant par défaut Supabase, jamais retiré) peut l'appeler.
revoke execute on function public.mkt_social_prev_snapshot(uuid[], date) from public, anon, authenticated;
