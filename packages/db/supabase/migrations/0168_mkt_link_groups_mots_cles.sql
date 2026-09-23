-- 0168 — Les groupes de liens se reconnaissent par des LISTES DE MOTS, plus par des expressions
-- régulières (demande Benoit 2026-09-23, devant l'écran de 0167 : « quelle est la signification de
-- tous les champs ? »).
--
-- 0167 exposait sous le libellé « mot-clé » des motifs comme `(^|[_ .-])seo($|[_ .-]|[0-9])` :
-- une syntaxe de développeur, que personne au pôle marketing ne pouvait relire, et qu'une
-- parenthèse de travers suffisait à rendre muette. Trois listes la remplacent :
--
--   contains     — le nom CONTIENT le mot ;
--   starts_with  — le nom COMMENCE par le mot (« ara » : sans ce mode, « Sarahcirre » partirait
--                  dans Twitter, la règle historique ne visant que les noms qui débutent ainsi) ;
--   words        — le nom contient le mot ENTIER (les sigles courts : « ig » ne doit pas
--                  reconnaître « hotgirl », ni « seo » reconnaître « seonyu »).
--
-- La comparaison se fait sans majuscules, sans accents et sans séparateurs (règle
-- `matchesLinkGroup`, `@glagency/core`) : un seul mot « fbads » reconnaît « Malik_fb_ads » ET
-- « MalikFBAds ».
--
-- CONVERSION VÉRIFIÉE : l'ancienne règle et la nouvelle ont été rejouées sur les 361 noms de la
-- prod le 2026-09-23 — 0 lien ne change de groupe.

alter table public.mkt_link_groups
  add column if not exists contains    text[] not null default '{}',
  add column if not exists starts_with text[] not null default '{}',
  add column if not exists words       text[] not null default '{}';

update public.mkt_link_groups set contains = '{snap}'                        where key = 'snapchat';
update public.mkt_link_groups set contains = '{fbads,facebook}'              where key = 'fb_ads';
update public.mkt_link_groups set words    = '{seo}'                         where key = 'seo';
update public.mkt_link_groups set contains = '{tiktokads,adstiktok}'         where key = 'tiktok_ads';
update public.mkt_link_groups set contains = '{tiktok}'                      where key = 'tiktok';
update public.mkt_link_groups set contains = '{trafficstar}'                 where key = 'trafficstars';
update public.mkt_link_groups
   set contains = '{telegram}', starts_with = '{tel}', words = '{tg}'        where key = 'telegram';
update public.mkt_link_groups
   set contains = '{twitter}', starts_with = '{tw,roro,keller,ara}'          where key = 'twitter';
update public.mkt_link_groups
   set contains = '{insta,threads}', words = '{ig}'                          where key = 'instagram';

-- Tout autre groupe (créé par l'ingestion, ou à la main pendant la recette) : son motif était
-- « la clé en tête de nom », ce que « mot entier » reprend.
update public.mkt_link_groups
   set words = array[key]
 where pattern <> ''
   and key not in ('snapchat', 'fb_ads', 'seo', 'tiktok_ads', 'tiktok', 'trafficstars',
                   'telegram', 'twitter', 'instagram');

alter table public.mkt_link_groups drop column if exists pattern;
