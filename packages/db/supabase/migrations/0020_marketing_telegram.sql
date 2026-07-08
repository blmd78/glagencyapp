-- 0020 — Telegram devient un canal à part entière (funnel Clément ~4 300 €) : nouveau
-- type de lien + reclassement des liens Telegram jusqu'ici rangés dans « other ».
alter table mkt_links drop constraint mkt_links_type_check;
alter table mkt_links add constraint mkt_links_type_check
  check (type in ('twitter', 'instagram', 'other', 'telegram'));

update mkt_links
set type = 'telegram'
where type = 'other'
  and (name ~* '_tg($|_)' or name ~* 'telegram' or name ilike 'tel%');
