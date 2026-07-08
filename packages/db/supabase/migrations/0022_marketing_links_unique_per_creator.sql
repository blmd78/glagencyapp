-- 0022 — Les noms de liens MyPuls ne sont uniques QUE PAR CRÉATRICE (plusieurs
-- créatrices ont un lien « Insta ») : l'unicité globale sur name écrasait leurs
-- données entre elles. Unicité corrigée + purge des lignes fusionnées à tort
-- (données dérivées : réimportées depuis la série daily officielle de MyPuls).
truncate mkt_staff_links, mkt_link_daily, mkt_links;
alter table mkt_links drop constraint mkt_links_name_key;
alter table mkt_links add constraint mkt_links_creator_name_key unique (mypuls_creator_id, name);
