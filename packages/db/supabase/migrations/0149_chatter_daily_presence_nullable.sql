-- LA PRÉSENCE N'A PLUS DE SOURCE — il faut donc pouvoir dire « on ne sait pas », pas « zéro ».
--
-- CE QUI A CHANGÉ. Le 2026-09-03, MyPuls a sorti son tableau « Résumé chatteur » de la page
-- money-team pour le charger en AJAX, et il en a profité pour passer de NEUF colonnes à HUIT :
-- c'est « Présence (actif / idle) » qui a disparu. Ces deux colonnes n'ont donc plus aucune source
-- d'alimentation. Vérifié sur capture du 2026-09-06.
--
-- POURQUOI `null` ET NON `0`. `presence_active_h` est affichée telle quelle dans l'onglet Chatteurs
-- (« 12h / 3h »), et son composant sait DÉJÀ rendre « — » sur `null`
-- (`chatters-columns.tsx:141`). Écrire 0 rendrait « 0h / 0h » — c'est-à-dire « cette personne
-- n'a pas travaillé », indiscernable de « on ne mesure plus ». C'est exactement l'invariant que le
-- Relevé MyPuls s'est donné (« un jour sans run affiche relevé indisponible, JAMAIS des zéros ») ;
-- il vaut ici pour la même raison : des sanctions se prennent sur ces chiffres.
--
-- Les lignes DÉJÀ écrites gardent leurs valeurs : jusqu'au 2026-09-02 la mesure existait, et rien
-- ne justifie de l'effacer. La colonne devient simplement facultative pour la suite.
--
-- LA MESURE DE PRÉSENCE, ELLE, N'EST PAS PERDUE : elle vient du relevé « Contrôle des shifts »
-- (`mypuls_shift_*`, Releases 2.26→2.28) depuis le 2026-09-01, et c'est déjà la seule que
-- l'encadrement regarde.

alter table public.chatter_daily
  alter column presence_active_h drop not null,
  alter column presence_idle_h   drop not null;

comment on column public.chatter_daily.presence_active_h is
  'Heures ACTIVES du chatteur ce jour-là, telles que MyPuls les donnait dans le résumé money-team. '
  '`null` depuis le 2026-09-03 : la colonne a disparu de leur tableau. Ne pas remplacer par 0 — '
  'l''UI affiche « — » sur null, et « 0h » serait un mensonge. Mesure de remplacement : '
  'mypuls_shift_* (relevé Contrôle des shifts).';
comment on column public.chatter_daily.presence_idle_h is
  'Heures INACTIVES (connecté sans activité). Mêmes règles que presence_active_h : `null` depuis '
  'le 2026-09-03, la source a disparu.';
