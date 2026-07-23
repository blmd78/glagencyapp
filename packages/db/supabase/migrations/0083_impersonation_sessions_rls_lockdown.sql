-- 0083 — Durcissement RLS de `impersonation_sessions` (suite ré-audit sécu).
--
-- La policy de lecture posée en 0081 (`for select to authenticated using is_admin()`) rendait
-- le `sid` (id de la row) de TOUTE session d'impersonation active lisible par n'importe quel
-- admin. Combiné au cookie d'état opaque non signé, ça ouvrait une escalade : un admin pouvait
-- lire le `sid` actif d'un superadmin, le rejouer dans son cookie `imp_sid`, et via le re-mint
-- du teardown récupérer la session de l'acteur (= devenir superadmin).
--
-- Les lectures in-app passent TOUTES par le client service-role (`createAdminClient`, bypass
-- RLS) → aucune policy `authenticated` n'est nécessaire. On la retire : RLS reste activée +
-- zéro policy = deny par défaut pour `authenticated`, seul le service-role lit. La défense est
-- complétée côté app par la vérif `sub === target_id` dans `performStop` (le re-mint n'a lieu
-- que pour le navigateur qui impersonne réellement la cible).
drop policy if exists impersonation_sessions_read on public.impersonation_sessions;

-- Index partiel redondant avec la PK : tous les accès à la table sont mono-ligne par `id`
-- (getActorForSid/getRowById/endRow = `.eq('id', …)`), donc la PK suffit. On le retire.
drop index if exists public.impersonation_sessions_active_idx;
