-- Correction du périmètre superadmin (retour utilisateur) : les ADMINS GARDENT la
-- gestion des membres (page Membres comprise) — le rôle superadmin ne réserve pas ce
-- périmètre. Protections conservées au niveau base : un admin ne peut ni modifier un
-- profil superadmin, ni attribuer le rôle superadmin (pas d'auto-promotion).
drop policy if exists profiles_superadmin_write on profiles;
create policy profiles_admin_write on profiles for update to authenticated
  using (public.is_admin() and (role <> 'superadmin' or public.is_superadmin()))
  with check (public.is_admin() and (role <> 'superadmin' or public.is_superadmin()));
