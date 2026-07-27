-- 0088 — La période de paie devient 14 jours calés sur les lundis.
--
-- POURQUOI. `compta_payments` identifiait une période par `(month, period 1|2)` : la quinzaine
-- calendaire 1–15 / 16–fin de mois. La feuille de paie de juillet du propriétaire (lue le
-- 2026-07-27) prouve que ce n'est pas ce qu'il paie : ses blocs sont des DEUX SEMAINES pleines
-- calées sur les lundis (S1 = 06→12/07, S2 = 13→19/07, le paiement du bloc S2 cumulant les nets
-- de S1 et S2 — donc couvrant 06/07 → 19/07), et l'onglet « juillet » court du 06/07 au 02/08.
--
-- Deux conséquences pour cette table :
--  1. `period in (1,2)` DEVIENT FAUX — trois périodes de 14 jours peuvent démarrer dans le même
--     mois (ex. 01/06, 15/06 et 29/06 pour un découpage ancré ailleurs). La contrainte
--     rejetterait un paiement parfaitement légitime.
--  2. `month` DEVIENT UN MENSONGE — une période ne se rattache plus à aucun mois (celle du
--     20/07/2026 finit le 02/08). Y stocker un lundi laisserait le nom contredire le contenu.
--
-- SANS RISQUE : `compta_payments` est VIDE. Mesuré le 2026-07-27 sur l'UAT,
-- `select count(*) from public.compta_payments` → 0. La prod n'a pas été ouverte pour cette
-- tâche ; elle n'a de toute façon reçu ni 0085 (qui purge la table et crée `period`) ni 0087,
-- d'où les `if exists` ci-dessous : appliquée un jour en production, cette migration y trouvera
-- une table sans colonne `period` et sans contrainte à supprimer.
--
-- `compta_day_entries` (clée par date) et `compta_week_entries` (clée par lundi) ne bougent
-- PAS : elles sont déjà indépendantes du découpage, seul leur regroupement change.
-- Le trigger de non-chevauchement `compta_payment_no_overlap` (0087) ne bouge pas non plus —
-- il raisonne sur `covered_days` et `chatter_id`, jamais sur la période (vérifié : c'est la
-- SEULE fonction de `public` qui mentionne `compta_payments`, et aucune vue n'en dépend).

alter table public.compta_payments drop constraint if exists compta_payments_period_check;
alter table public.compta_payments drop column if exists period;

alter table public.compta_payments rename column month to period_start;
-- L'index suit sa colonne mais garde son ancien nom, qui deviendrait trompeur.
alter index if exists public.compta_payments_month_idx rename to compta_payments_period_start_idx;

-- Le découpage EST une contrainte de données, pas seulement une convention applicative : une
-- période démarre un lundi `M` tel que `(M − 2026-07-06) mod 14 = 0` (ancre vérifiée sur la
-- feuille, confirmée par les blocs voisins du 20/07 et du 22/06). Sans ce check, un paiement
-- posé à la main sur une date décalée créerait des périodes qui se chevauchent — et la
-- couverture (`covered_days`) comme le bandeau de retard deviendraient incohérents en silence.
-- `mod` suit le signe du dividende en Postgres, mais vaut bien 0 sur toute date alignée,
-- avant comme après l'ancre.
alter table public.compta_payments
  add constraint compta_payments_period_start_aligned
  check (mod(period_start - date '2026-07-06', 14) = 0);
