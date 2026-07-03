-- 0010 — Aligne l'ÉCRITURE des quotas et du flag d'exclusion LTV sur le modèle de
-- rôles 0008 : les policies « to authenticated using (true) » de 0005/0006 dataient
-- d'avant les rôles ; depuis 0008, un membre `user` cloisonné existe et pouvait
-- écrire quotas/creators.excluded via PostgREST direct (fausser la LTV).
-- Écriture réservée aux admins (public.is_admin(), security definer, cf. 0008) ;
-- la lecture reste `authenticated` (la page est gérée par requireAccess('quotas')).

-- Idempotent (drop if exists AVANT chaque create) : une partie du contenu a pu être
-- appliquée en direct avant la régularisation en fichiers — rejouable sans erreur.

-- quotas : write admin-only
drop policy if exists quotas_auth_insert on quotas;
drop policy if exists quotas_auth_update on quotas;
drop policy if exists quotas_auth_delete on quotas;
drop policy if exists quotas_admin_insert on quotas;
drop policy if exists quotas_admin_update on quotas;
drop policy if exists quotas_admin_delete on quotas;
create policy quotas_admin_insert on quotas for insert to authenticated with check (public.is_admin());
create policy quotas_admin_update on quotas for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy quotas_admin_delete on quotas for delete to authenticated using (public.is_admin());

-- creators.excluded / excluded_reason (grant colonne 0006 inchangé) : update admin-only
drop policy if exists creators_auth_update on creators;
drop policy if exists creators_admin_update on creators;
create policy creators_admin_update on creators
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
