-- 0114 — Test de recrutement : la banque de questions de logique devient de TAILLE LIBRE
-- (1 à 20 emplacements), là où 0113 [ex-0125] la figeait à 5 de bout en bout.
--
-- Ce que ça change côté barème : la logique continue de peser 30 points du verdict, mais chaque
-- question vaut désormais 30/N (`computeVerdict(qi, qiTotal, …)` dans packages/core). N n'est PAS
-- une constante d'application : c'est le nombre de questions de LA tentative, figé à son tirage
-- (longueur de `recruit_attempts.qi_answers`, la clé de correction). L'admin peut donc ajouter ou
-- retirer une question pendant qu'un candidat joue — sa correction, son chrono et son verdict
-- restent ceux du questionnaire qu'on lui a réellement servi.
--
-- Migration CORRECTRICE (0113 est déjà appliquée) : on ne réécrit pas 0113, on élargit ici.
--
-- Aucune donnée à reprendre : `recruit_candidates` est vide sur les deux bases (UAT purgée, la
-- table n'existe pas encore en prod) — d'où un `qi_total` NOT NULL SANS default, qui force chaque
-- écriture à dire le nombre de questions de sa tentative plutôt que d'hériter d'un 5 muet.

-- ---------------------------------------------------------------------------------------------
-- 1. Scores de logique : 0..5 → 0..20 (plafond = taille maximale de la banque)
-- ---------------------------------------------------------------------------------------------

-- Checks anonymes de 0113 → noms auto-générés par Postgres (`<table>_<colonne>_check`). Pas de
-- `if exists` : si l'un manquait, c'est que le schéma a dérivé et la migration DOIT s'arrêter là
-- plutôt que d'ajouter une contrainte à côté d'une ancienne restée en place.
alter table public.recruit_attempts drop constraint recruit_attempts_qi_score_check;
alter table public.recruit_attempts
  add constraint recruit_attempts_qi_score_check check (qi_score between 0 and 20);

alter table public.recruit_candidates drop constraint recruit_candidates_qi_score_check;
alter table public.recruit_candidates
  add constraint recruit_candidates_qi_score_check check (qi_score between 0 and 20);

-- Le seuil de logique est un NOMBRE de bonnes réponses : il doit pouvoir monter avec la banque.
-- Son vrai plafond (« pas plus que le nombre de questions ») est CROISÉ avec `qi_bank`, donc porté
-- par le formulaire admin (`configForm`, superRefine) ; ici on ne borne que l'absolu.
alter table public.recruit_config drop constraint recruit_config_qi_min_check;
alter table public.recruit_config
  add constraint recruit_config_qi_min_check check (qi_min between 0 and 20);

-- ---------------------------------------------------------------------------------------------
-- 2. Dénominateur du dossier candidat
-- ---------------------------------------------------------------------------------------------

-- Sans cette colonne, « 4 » sur une fiche ne voudrait plus rien dire dès que la banque change de
-- taille : le dossier est un SNAPSHOT (comme `global`, `passed`, `refusal_reason`), il porte donc
-- son propre barème. Écrite par `submitCandidate` depuis la longueur de la clé de correction.
alter table public.recruit_candidates
  add column qi_total smallint not null check (qi_total between 1 and 20);

comment on column public.recruit_candidates.qi_total is
  'Nombre de questions de logique de la tentative (1..20), figé à la soumission — dénominateur de qi_score.';
comment on column public.recruit_candidates.qi_score is
  'Bonnes réponses au test de logique (0..qi_total).';
comment on column public.recruit_attempts.qi_answers is
  'Clé de correction tirée pour cette tentative (1 à 20 index de bonne réponse) — sa LONGUEUR fait foi sur le nombre de questions ; ne descend jamais au client.';
comment on column public.recruit_config.qi_bank is
  'Banque QI : 1 à 20 emplacements, chacun avec >= 1 variante de 4 options. Une variante tirée par emplacement à chaque tentative.';
comment on column public.recruit_config.qi_min is
  'Bonnes réponses minimum au test de logique — ne doit pas dépasser le nombre d''emplacements de qi_bank (validé applicativement).';
