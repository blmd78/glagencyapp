-- 0025 — Cloisonnement des fiches VA par manager : chaque fiche mkt_staff appartient
-- au profil qui l'a créée (owner_id). Un manager (droit mkt-staff) ne voit et ne
-- modifie QUE ses fiches ; un admin voit tout. Les fiches historiques (owner_id null)
-- restent visibles de l'admin seul.

alter table mkt_staff add column owner_id uuid references profiles(id) on delete set null;

drop policy mkt_staff_all on mkt_staff;
create policy mkt_staff_own on mkt_staff for all to authenticated
  using (public.has_page('marketing') and (public.is_admin() or owner_id = (select auth.uid())))
  with check (public.has_page('marketing') and (public.is_admin() or owner_id = (select auth.uid())));

-- Tables liées : visibles si la fiche parente l'est — le RLS de mkt_staff s'applique
-- DANS la sous-requête, donc un manager n'y voit que ses VA, l'admin tout.
drop policy mkt_staff_links_all on mkt_staff_links;
create policy mkt_staff_links_own on mkt_staff_links for all to authenticated
  using (exists (select 1 from mkt_staff s where s.id = staff_id))
  with check (exists (select 1 from mkt_staff s where s.id = staff_id));

drop policy mkt_staff_payments_all on mkt_staff_payments;
create policy mkt_staff_payments_own on mkt_staff_payments for all to authenticated
  using (exists (select 1 from mkt_staff s where s.id = staff_id))
  with check (exists (select 1 from mkt_staff s where s.id = staff_id));
