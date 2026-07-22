-- 0077 — Désignation « closing » portée par le MEMBRE (compte app), éditée dans la page Membres.
-- Jusqu'ici setter/closer + équipe rouge/bleue vivaient sur `chatters` (édités sur /chatter/chatters).
-- On les ajoute côté `profiles` pour un chatteur, indépendamment. La synchro avec `chatters`
-- (lien membre↔chatteur, Spenders, retrait de l'édition côté page Chatters, migration de
-- l'existant) est un chantier ULTÉRIEUR — ici on ne fait qu'ajouter les 2 colonnes.
--
-- Nommées `closing_*` pour ne PAS confondre avec `profiles.role` (rôle de permission).
-- Nullable (aucun défaut) : la plupart des membres n'ont pas de désignation closing. Écriture
-- réservée aux chatteurs côté application (actions Membres) — non contraint en base (garde app).
alter table public.profiles
  add column closing_role text check (closing_role in ('setter', 'closer')),
  add column closing_team text check (closing_team in ('rouge', 'bleue'));
