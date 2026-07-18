-- Codes Snap devient une page ASSIGNABLE : la LECTURE de snap_codes s'ouvre aux membres
-- ayant la page ('codes-snap' dans profiles.pages). has_page() inclut déjà admin/superadmin
-- (0044) → cette policy couvre admin ET accordé. L'ÉCRITURE reste réservée aux admins :
-- snap_codes_admin_all (0047, `for all using is_admin()`) est INCHANGÉE et seule à s'appliquer
-- aux insert/update/delete (miroir de l'adminGuard côté Server Action).
create policy snap_codes_read on snap_codes for select to authenticated
  using (public.has_page('codes-snap'));
