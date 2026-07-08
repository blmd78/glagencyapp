-- 0019 — Cache des cumuls MyPuls sur mkt_links : la source expose des compteurs
-- cumulatifs ; l'ingestion calcule delta = cumul_lu − cumul_cache (clamp ≥ 0, un cumul
-- qui redescend = lien remis à zéro → le delta repart du cumul lu). Évite de sommer
-- mkt_link_daily à chaque run. Seed = somme des deltas importés (= dernier cumul connu).

alter table mkt_links
  add column cum_clicks      integer       not null default 0,
  add column cum_conversions integer       not null default 0,
  add column cum_revenue_eur numeric(12,2) not null default 0,
  add column last_seen       date;

update mkt_links l
set cum_clicks      = coalesce(s.clicks, 0),
    cum_conversions = coalesce(s.conv, 0),
    cum_revenue_eur = coalesce(s.rev, 0),
    last_seen       = s.last_date
from (
  select link_id, sum(clicks) clicks, sum(conversions) conv, sum(revenue_eur) rev, max(date) last_date
  from mkt_link_daily group by link_id
) s
where s.link_id = l.id;
