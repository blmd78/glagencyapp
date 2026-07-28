-- 0091 — L'INSTANTANÉ DE PAIEMENT rattrape les trois lignes du lot final.
--
-- POURQUOI CETTE MIGRATION EXISTE. `computePayslip` porte depuis la tâche 22 trois composantes de
-- plus (`carryover`, `setterPrime`, `monthlyPrime`, spec §4), et l'invariant de l'instantané
-- (spec §5.3) est vérifié à DEUX endroits côté application :
--   * le `superRefine` de `payInput` (`features/compta/schema.ts`), qui compare `amount` à la
--     somme des composantes ENVOYÉES ;
--   * le recalcul serveur de `payPeriod` (`features/compta/actions-pay.ts`), ligne à ligne.
-- Brancher les trois sources (tâche 23) SANS ces colonnes ferait donc échouer TOUT paiement d'une
-- fiche qui en porte une, avec le message « le net n'est pas la somme des lignes » : le net inclut
-- les trois, la somme vérifiée n'en connaît que sept.
--
-- AUCUN DÉFAUT — c'est la doctrine explicite de 0085, reprise mot pour mot (spec §5.3) : « un
-- `default 0` les rendrait optionnelles dans le type `Insert` généré : un paiement omettant une
-- composante compilerait et écrirait 0 €, faisant disparaître un montant sans bruit ». Sans
-- défaut, le compilateur exige les ONZE composantes à chaque enregistrement.
--
-- SANS RISQUE, MESURÉ : `compta_payments` = 0 ligne sur l'UAT le 2026-07-28, juste avant
-- d'écrire ce fichier (`select count(*)`). Un `add column ... not null` sans défaut échouerait
-- sur une table peuplée — et c'est le comportement voulu : mieux vaut un push en échec qu'un
-- instantané rétroactif rempli de zéros inventés.
--
-- LA PROD N'A PAS ÉTÉ OUVERTE (consigne : `DATABASE_URL` sans suffixe ne s'ouvre pas). Elle n'a
-- reçu ni 0085…0090 ; `compta_payments` n'y porte donc AUCUNE des colonnes d'instantané, et 0085
-- y créera les huit premières avec la même contrainte. Si elle contenait des lignes héritées,
-- c'est 0085 qui échouerait en premier, avant celle-ci.

alter table public.compta_payments
  -- « RESTE SEMAINE PASSEE » — SIGNÉ, comme `compta_period_entries.carryover` (0090) et comme
  -- `amount` lui-même : un trop-perçu se reporte en négatif. AUCUN `check (>= 0)` ici, et c'est
  -- la seule des trois à ne pas en avoir : l'imposer obligerait à contourner le report par un
  -- malus, qui ne dit pas la même chose sur la fiche.
  add column if not exists carryover_amount     numeric(10,2) not null,
  -- « PRIME TOP15 SETTER » — la tranche de `compta_setter_scale` au rang du membre dans le
  -- classement des handoffs de la période (`rankSetters`). FIGÉE ICI, et c'est tout l'intérêt :
  -- le classement se recalcule à chaque rendu à partir des handoffs SAISIS, qu'un manager peut
  -- corriger après coup — le rang d'un membre déjà payé changerait alors sa prime rétroactivement.
  -- L'instantané rend le versement opposable, exactement comme `ca_reference` face à une
  -- ré-ingestion MyPuls (spec §5.3).
  add column if not exists setter_prime_amount  numeric(10,2) not null,
  -- « PRIME TOP3 MOIS » — saisie à la main (`compta_period_entries.top3_prime`).
  add column if not exists monthly_prime_amount numeric(10,2) not null;

comment on column public.compta_payments.carryover_amount is
  'Report de la période précédente, figé au virement. SIGNÉ (un trop-perçu se reporte en négatif).';
comment on column public.compta_payments.setter_prime_amount is
  'Prime du classement setter (TOP15), figée au virement — le rang, lui, se recalcule.';
comment on column public.compta_payments.monthly_prime_amount is
  'Prime du mois (TOP3), figée au virement.';

-- RIEN D'AUTRE. Aucune contrainte de somme en base : l'invariant
-- `amount = base + setter + bonus − malus + handoffs + prime − sanctions + carryover +
-- setterPrime + monthlyPrime` est vérifié côté application (les deux points cités en tête). Un
-- `check` l'exprimant ici serait redondant avec le recalcul serveur, et il refuserait les
-- paiements légitimes dès qu'un centime d'arrondi flottant s'y glisserait — la tolérance de
-- 0,01 € vit dans le code, elle ne s'écrit pas en SQL sans le durcir de travers.
--
-- AUCUNE POLICY À TOUCHER : `compta_payments_admin_write` / `_scope_read` (0085) portent sur la
-- TABLE, pas sur ses colonnes. Ajouter une colonne ne change aucun droit.
