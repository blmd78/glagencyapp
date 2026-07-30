-- 0100 — Suppression de `chatters.shift`, devenue sans usage.
--
-- Deuxième et dernier temps du déplacement entamé en 0099 : le shift est porté par le MEMBRE
-- (`profiles.shift`) depuis que 0099 a été appliquée et que le code correspondant est en
-- production. La colonne d'origine survivait uniquement pour que l'ancien code continue de
-- tourner pendant le déploiement — cette fenêtre est fermée.
--
-- POURQUOI EN DEUX MIGRATIONS. Dropper la colonne dans 0099 aurait cassé la page Membres entre
-- l'application de la migration et la mise en ligne du code : `getMembers` lisait encore
-- `chatters.shift`. La séquence tenue a été : 0099 (ajout + reprise des valeurs) → déploiement
-- du code → 0100 (drop). En prod, 84 shifts ont été repris sur le membre ; les 11 fiches sans
-- membre lié n'ont pas été migrées, volontairement (anciens chatteurs, cf. 0099).
--
-- DÉPENDANCES VÉRIFIÉES avant écriture (pg_constraint / pg_indexes / pg_depend / pg_proc) :
-- seule `chatters_shift_check` référence la colonne, et elle tombe avec elle. Aucune vue,
-- aucun index, aucune fonction. Plus aucun code applicatif ne la lit (`get-chatters.ts` a
-- perdu sa lecture, la page Chatters sa colonne et son crayon).

alter table public.chatters drop column if exists shift;
