-- 0095 — LE REPORT ET LA PRIME DU MOIS SORTENT DE LA COMPTA.
--
-- DÉCISION DE BENOIT, 2026-07-28 : « enlève, y'a pas de reste semaine passée, ça existera pas,
-- à part si on me le demande » — et pour la prime du mois : « on sélectionne une période de
-- 2 semaines, je trouve ça a pas de sens, vire-le, on verra si on me redemande ça. » Le report
-- (`RESTE SEMAINE PASSEE`) n'a jamais été élucidé ; la prime du mois était un montant MENSUEL
-- saisi sur un écran de PÉRIODE. Les deux concepts disparaissent de l'app entière — cette
-- migration retire ce qui les portait en base. La PRIME SETTER (TOP15), calculée et non saisie,
-- reste intégralement (`compta_setter_scale`, `compta_payments.setter_prime_amount`).
--
-- MESURES FAITES SUR L'UAT LE 2026-07-28, JUSTE AVANT D'ÉCRIRE CE FICHIER :
--   * `compta_period_entries` = 0 ligne ;
--   * `compta_payments` = 0 ligne (donc 0 valeur dans `carryover_amount` et
--     `monthly_prime_amount`).
-- Aucune donnée réelle n'est détruite. LA PROD N'A PAS ÉTÉ OUVERTE (consigne : `DATABASE_URL`
-- sans suffixe ne s'ouvre pas) ; elle n'a reçu aucune des migrations 0085…0094, donc aucun de
-- ces objets n'y existe.

-- ── 1. La table de saisie par période (0090) ─────────────────────────────────────────────
-- Le `drop table` emporte sa policy (`compta_period_entries_scope`), ses index
-- (`_period_start_idx`, `_updated_by_idx`) et l'index unique partiel
-- `compta_period_entries_one_top3_per_month` (0092) — ils appartiennent tous à la table.
-- Pas de `cascade` : aucune vue ni FK entrante ne dépend d'elle (les FK sortent vers
-- `profiles`), un `restrict` implicite qui échouerait est préférable à un `cascade` qui
-- emporterait une dépendance oubliée.
drop table if exists public.compta_period_entries;

-- ── 2. Les deux colonnes d'instantané (0091) ─────────────────────────────────────────────
-- `setter_prime_amount` (la prime setter) RESTE. L'invariant du paiement repasse à HUIT
-- composantes : `amount = base + setter + bonus − malus + handoffs + prime − sanctions +
-- setter_prime` — vérifié côté application (`payInput`, recalcul serveur de `payPeriod`).
alter table public.compta_payments
  drop column if exists carryover_amount,
  drop column if exists monthly_prime_amount;
