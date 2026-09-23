-- 0169 — Distinguer un lien rangé À LA MAIN d'un lien rangé PAR LA RÈGLE (bug remonté par Benoit
-- le 2026-09-23 : un groupe « SNAP + DA » créé pour séparer les liens SNAP_HAPPN restait vide).
--
-- Cause : créer un groupe ne rangeait que la file « À classer » — la promesse de 0167 était « un
-- lien rangé ailleurs ne bouge jamais ». Elle interdisait précisément de DÉCOUPER un groupe : les
-- trois SNAP_HAPPN, rangés dans Snapchat par la règle, n'avaient aucune raison d'en sortir.
--
-- La bonne promesse est plus étroite : un lien rangé À LA MAIN ne bouge jamais. Tout le reste suit
-- les règles du moment, et créer ou modifier un groupe les rejoue. D'où ce drapeau.
--
-- LES 13 LIENS MARQUÉS : ceux dont le groupe en base diffère de ce que les règles donnent — mesuré
-- sur la prod le 2026-09-23 (règle `detectLinkGroup` rejouée sur les 361 liens). Ce ne peut être
-- qu'un rangement manuel (menu de la ligne, ou surcharge héritée du legacy) : `funnel_tiktok_tg`
-- est dans Telegram alors que la règle dit TikTok, quelqu'un l'a voulu. Identifiés par (nom, groupe)
-- et non par id, les ids différant entre prod et UAT ; sur UAT, les absents sont sans effet.

alter table public.mkt_links
  add column if not exists type_manual boolean not null default false;

comment on column public.mkt_links.type_manual is
  'Groupe choisi À LA MAIN (menu de la ligne) : les règles ne le déplacent plus jamais. False = le lien suit les règles, rejouées à chaque création ou modification de groupe.';

update public.mkt_links set type_manual = true
 where (name, type) in (
   ('l_enaaa_',         'instagram'),
   ('lolafpss',         'instagram'),
   ('test',             'instagram'),
   ('alicetageek',      'instagram'),
   ('pasdecopainnn',    'instagram'),
   ('INCarlaJadot',     'instagram'),
   ('luciemns_',        'instagram'),
   ('Manon_cbh',        'instagram'),
   ('carlaa_la_prof',   'twitter'),
   ('CARLASUN',         'twitter'),
   ('Sarah_clns',       'twitter'),
   ('funnel_tiktok_tg', 'telegram'),
   ('Funnel_tiktok_tg', 'telegram')
 );
