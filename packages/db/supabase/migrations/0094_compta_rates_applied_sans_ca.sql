-- 0094 — `compta_payments.rates_applied` : autoriser l'instantané VIDE quand il n'y a pas de CA.
--
-- CORRECTION de la contrainte posée par 0093, trouvée en branchant le paiement. `0093` exigeait
-- `jsonb_array_length(rates_applied) >= 1` — ce qui BLOQUE un paiement parfaitement légitime :
-- un membre sans aucun CA sur la période mais qui touche une prime, un bonus ou un fixe. La
-- spec §10 le dit en toutes lettres (« Période sans aucune donnée CA → net = 0 […] les
-- bonus/primes restent dus »), et `computePayslip` ne produit alors AUCUN segment de taux :
-- il n'y a rien à commissionner, donc aucun taux appliqué. `[]` est la réponse exacte.
--
-- La contrainte n'est pas supprimée, elle est RECENTRÉE sur ce qu'elle doit vraiment interdire :
-- une COMMISSION versée sans trace du taux qui l'a produite. `base_amount > 0` sans segment
-- serait un instantané qui ne permet plus de refaire le calcul — c'est ça, le vrai défaut.
--
-- La migration 0093 n'est PAS modifiée : elle est déjà enregistrée dans `schema_migrations`
-- (UAT), et retoucher un fichier appliqué désaligne l'historique — le piège à l'origine du
-- nettoyage `36ae438` (CLAUDE.md).

alter table public.compta_payments drop constraint if exists compta_payments_rates_applied_check;
alter table public.compta_payments
  add constraint compta_payments_rates_applied_check
  check (
    jsonb_typeof(rates_applied) = 'array'
    and (base_amount = 0 or jsonb_array_length(rates_applied) >= 1)
  );
