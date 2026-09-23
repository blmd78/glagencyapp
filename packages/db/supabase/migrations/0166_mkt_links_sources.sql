-- 0166 — Cinq sources de trafic de plus sur les liens de tracking (demande Benoit 2026-09-22 :
-- « faut rajouter SNAP, FB_ADS, SEO, en groupe tiktok aussi »).
--
-- « Autres » était devenu un fourre-tout de 64 liens sur 361, dont 13 Snapchat, 4 TikTok,
-- 2 Facebook Ads, 1 SEO et 7 Instagram mal classés. Le groupe résiduel ne doit rester que ce
-- qu'il est : les liens dont le NOM ne dit rien de leur plateforme (~37 pseudos).
--
-- TikTok et TikTok Ads sont DEUX sources, pas une (demande explicite) : un lien organique de la
-- farm et une campagne payée ne se pilotent pas pareil.
--
-- La règle de détection vit UNE fois, pure et testée, en `@glagency/core`
-- (`marketing/link-type.ts`) — l'ingestion la pose à la CRÉATION d'un lien, jamais ensuite :
-- un type corrigé à la main dans l'écran Liens n'est pas réécrasé au scrape suivant.
--
-- Le reclassement des liens existants ne touche QUE ceux qui sont en « other » : un lien déjà
-- rangé a pu l'être à la main, et rien ne distingue en base un classement manuel d'un
-- classement automatique.

alter table mkt_links drop constraint mkt_links_type_check;
alter table mkt_links add constraint mkt_links_type_check
  check (type in (
    'twitter', 'instagram', 'telegram',
    'snapchat', 'tiktok', 'tiktok_ads', 'fb_ads', 'seo',
    'other'
  ));

-- Reclassement one-shot des seuls « other ». Les motifs sont le MIROIR de `detectLinkType`
-- (même ordre, du plus spécifique au plus général) ; la référence reste le TypeScript testé,
-- ce bloc-ci ne sert qu'à rattraper l'existant une fois.
--
-- VOLONTAIREMENT ABSENTES : les règles Telegram et Twitter. `detectLinkType` les applique aux
-- liens NEUFS, mais les rejouer ici déplacerait des liens que quelqu'un a pu ranger à la main —
-- « CLEMENT_TG » est en « other » alors que la règle Telegram le reconnaîtrait, et rien en base
-- ne dit si c'est un choix ou un reste d'avant 0020. On ne récupère donc que ce qui a été annoncé
-- (Snapchat, Facebook Ads, SEO, TikTok, TikTok Ads, Instagram) ; le reste se déplace d'un clic
-- dans l'écran Liens.
update mkt_links set type = case
  when name ~* '(^|[_ .-])snap'                                 then 'snapchat'
  when name ~* 'fb[_ .-]?ads|facebook'                          then 'fb_ads'
  when name ~* '(^|[_ .-])seo($|[_ .-]|[0-9])'                  then 'seo'
  when name ~* 'tiktok' and name ~* '(^|[_ .-])(ads?|paid|sponsor[a-z]*)($|[_ .-]|[0-9])'
                                                                then 'tiktok_ads'
  when name ~* 'tiktok'                                         then 'tiktok'
  when name ~* 'insta|threads|(^|[_ .-])ig($|[_ .-])'           then 'instagram'
  else 'other'
end
where type = 'other';
