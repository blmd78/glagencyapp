-- Écriture web du flag d'exclusion LTV / CA global sur les comptes (page Quotas :
-- checkbox « exclu de la LTV » des comptes privés). Design 0001 : creators.excluded
-- = « vrais exclus, hors CA » ; legacy = excluded_accounts.json (carlaprive, juliepvv, alice_prvv).
--
-- Le web ne peut modifier QUE excluded / excluded_reason (grant colonne) :
-- name, team_id, fusion, flags privés restent la propriété de l'ingestion (service-role, bypass RLS).
revoke update on creators from authenticated;
grant update (excluded, excluded_reason) on creators to authenticated;

create policy creators_auth_update on creators
  for update to authenticated using (true) with check (true);
