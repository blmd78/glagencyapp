-- Défaut produit : les comptes privés (carlaprive, juliepvv, alice_prvv) sont exclus
-- de la LTV par défaut — reproduit le comportement legacy (excluded_accounts.json).
-- Sémantique de creators.excluded (décision 2026-07-03) : exclusion du calcul LTV
-- UNIQUEMENT (page État de santé). CA global, totaux, pages Modèles/Chatteurs :
-- tous les comptes comptent, exclus compris. Reste modifiable via la page Quotas.
update creators
set excluded = true,
    excluded_reason = 'Privé — exclu de la LTV par défaut'
where is_private = true
  and excluded = false;
