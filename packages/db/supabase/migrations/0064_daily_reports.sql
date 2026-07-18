-- 0064 — Comptes rendus journaliers : met à jour les POLICIES de daily_reports (table créée
-- en 0053) pour le modèle validé avec Benoit (2026-07-18) :
--   • LECTURE hiérarchique : soi + rattachés DIRECTS (manager/sous-manager via manages(), 0054)
--     + admin/superadmin tout. Avant (0053) : superadmin + soi seulement.
--   • ÉCRITURE : le sien, avec le droit de page via has_page (couvre admin/superadmin ET les
--     accordés, CHATTEURS compris — le CR est un auto-rapport, pas une écriture partagée).
--     Avant (0060) : can_write_page, qui excluait les chatteurs.
-- Idempotente (drop/create). L'index (day desc) de 0053 est retiré : l'index de la contrainte
-- unique (profile_id, day) sert déjà l'unique motif de requête (un profil, day desc).
drop index if exists public.daily_reports_day_idx;

drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated
  using (
    public.is_admin()
    or profile_id = (select auth.uid())
    or (public.is_manager() and public.manages(profile_id))
  );

drop policy if exists daily_reports_ins on public.daily_reports;
create policy daily_reports_ins on public.daily_reports for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.has_page('dashboard'));

drop policy if exists daily_reports_upd on public.daily_reports;
create policy daily_reports_upd on public.daily_reports for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and public.has_page('dashboard'));

drop policy if exists daily_reports_del on public.daily_reports;
create policy daily_reports_del on public.daily_reports for delete to authenticated
  using (profile_id = (select auth.uid()) and public.has_page('dashboard'));
