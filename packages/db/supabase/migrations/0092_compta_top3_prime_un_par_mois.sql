-- 0092 — LA PRIME DU MOIS NE PEUT PLUS ÊTRE SAISIE DEUX FOIS DANS LE MÊME MOIS.
--
-- ── LE DÉFAUT ────────────────────────────────────────────────────────────────────────────
-- `compta_period_entries.top3_prime` (« PRIME TOP3 MOIS », 0090) est saisie PAR PÉRIODE de 14
-- jours. Or un mois civil en contient **2 ou 3** (`periodsOfMonth`, `packages/core`) : rien
-- n'empêchait de saisir la prime DU MOIS sur deux périodes du même mois, et de la verser deux
-- fois. C'est un défaut d'argent du même genre que le fixe setter corrigé au commit `2530866` —
-- montant par période logé dans une saisie hebdomadaire, donc affiché deux fois et sommé.
--
-- ── LA RÈGLE : LE MOIS D'UNE PÉRIODE EST CELUI DE SON LUNDI DE DÉPART ────────────────────
-- `date_trunc('month', period_start)`. C'est la règle déjà en place un cran plus bas dans la
-- feature — « une semaine est rattachée à la période de son LUNDI, et n'est jamais découpée »
-- (spec §3) — appliquée un cran plus haut. Sa propriété essentielle est d'être une PARTITION :
-- chaque période appartient à exactement UN mois. Une période à cheval (20/07 → 02/08) est donc
-- entièrement de juillet, et la période suivante (03/08) entièrement d'août ; aucune prime ne
-- peut être réclamée par deux mois, ni tomber entre deux.
--
-- Ce serait faux avec un rattachement « au prorata » ou « au mois majoritaire » : la période du
-- 31/08 → 13/09 (1 jour en août, 13 en septembre) basculerait en septembre alors que celle du
-- 17/08 est en août, et le mois d'août n'aurait plus de fin nette.
--
-- ── CE QUE CET INDEX GARDE, ET CE QU'IL NE GARDE PAS ────────────────────────────────────
-- IL GARDE la SAISIE : au plus une période par (chatteur, mois) peut porter une prime du mois
-- non nulle. C'est là que la faute se commet — deux périodes remplies, puis les deux payées
-- (le paiement groupé règle une période entière d'un geste).
--
-- IL NE GARDE PAS le VERSEMENT : rien n'empêche de payer la période 1 (prime figée dans
-- `compta_payments.monthly_prime_amount`), de remettre sa saisie à 0, puis de saisir la prime
-- sur la période 2 du même mois. Ce second trou est fermé CÔTÉ APPLICATION, exactement comme
-- l'est déjà celui de la prime d'embauche : `coverage.monthlyPrimePaid` lit l'INSTANTANÉ FIGÉ
-- (`monthly_prime_amount > 0` sur une période du même mois) et `compta-rows.ts` sort alors la
-- prime du net — même raisonnement que `coverage.primePaid` (spec §5.9). Un index ne peut pas
-- l'exprimer : la vérité est dans une AUTRE table.
--
-- ── POURQUOI UN INDEX PARTIEL ET PAS UNE CONTRAINTE PLEINE ───────────────────────────────
-- `where top3_prime > 0` : la ligne `compta_period_entries` porte AUSSI le report
-- (`carryover`), qui lui vaut par période et se saisit sur chacune. Une unicité pleine
-- interdirait d'enregistrer un report sur la seconde période du mois — elle casserait une
-- saisie légitime pour garder une autre. Vérifié sur l'UAT (transaction annulée) : avec cet
-- index, `(2026-07-20, carryover = −12,50, top3 = 0)` s'enregistre à côté de
-- `(2026-07-06, top3 = 200)`.
--
-- ── MESURES FAITES SUR L'UAT LE 2026-07-28, JUSTE AVANT D'ÉCRIRE CE FICHIER ──────────────
--   * `compta_period_entries` = 0 ligne, `compta_payments` = 0 ligne → aucune donnée existante
--     ne peut faire échouer la création de l'index. Sur une table peuplée, un échec serait le
--     comportement VOULU : mieux vaut un push refusé qu'une double prime laissée en place.
--   * Les quatre comportements de l'index vérifiés en transaction annulée : deux périodes du
--     même mois avec `top3 > 0` → `23505` ; report seul sur la seconde → accepté ; période à
--     cheval (07-20, mois de juillet) puis 08-03 (mois d'août) → accepté ; deux membres
--     différents sur le même mois → accepté.
-- LA PROD N'A PAS ÉTÉ OUVERTE (consigne : `DATABASE_URL` sans suffixe ne s'ouvre pas). Elle n'a
-- reçu ni 0085…0091 ; `compta_period_entries` n'y existe même pas.
--
-- `period_start::timestamp` est explicite et NÉCESSAIRE : `date_trunc(text, timestamptz)` est
-- STABLE (elle dépend de `TimeZone`) et Postgres refuse une fonction non immuable dans un index.
-- `date_trunc(text, timestamp)` est immuable.

create unique index if not exists compta_period_entries_one_top3_per_month
  on public.compta_period_entries (chatter_id, (date_trunc('month', period_start::timestamp)))
  where top3_prime > 0;

comment on column public.compta_period_entries.top3_prime is
  'PRIME TOP3 MOIS — montant MENSUEL saisi sur UNE des 2 ou 3 périodes du mois. Un index unique '
  'partiel (0092) interdit d''en saisir une seconde sur le même mois civil, le mois d''une '
  'période étant celui de son lundi de départ. Le garde contre un second VERSEMENT, lui, est '
  'applicatif : compta_payments.monthly_prime_amount (cf. coverage.monthlyPrimePaid).';
