-- 0097 — L'encadrement voit TOUT LE MONDE (décision Benoit 2026-07-29 soir : « un
-- sous-manager voit les managers et tout — il voit tout »).
--
-- 0095 laissait un dernier cloisonnement : un encadrant ne voyait que les chatteurs + ses
-- sous-managers + soi (un sous-manager ne voyait donc pas les managers dans Membres ni dans
-- le sélecteur du Dashboard). Terminé : manager/sous-manager voient tous les profils et tous
-- les comptes rendus. Bonus perf : les deux policies redeviennent de purs InitPlan (plus de
-- condition par ligne).
--
-- NE CHANGE PAS : le planning journalier (« nul ne lit/édite le planning d'un pair », 0061/
-- 0062) et la to-do (périmètre d'écriture manager → ses sous-managers) — règles d'ÉDITION
-- et de lecture propres à ces surfaces, conservées telles quelles.

drop policy if exists profiles_self_admin_or_team_read on public.profiles;
create policy profiles_self_admin_or_team_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_manager())
  );

drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated
  using (
    (select public.is_admin())
    or profile_id = (select auth.uid())
    or (select public.is_manager())
  );
