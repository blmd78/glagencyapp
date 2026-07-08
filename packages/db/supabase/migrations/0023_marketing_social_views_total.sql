-- 0023 — Scrape Instagram automatique (Apify) : views_total = cumul brut des vues des
-- ~12 derniers posts au moment du relevé. Le « vues 24 h » d'un jour = views_total du
-- jour − views_total de la veille (clampé ≥ 0). La saisie manuelle reste possible
-- (views_24h saisi directement, views_total null).
alter table mkt_social_daily add column views_total bigint;
