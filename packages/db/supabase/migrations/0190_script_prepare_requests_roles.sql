-- 0190 — Clés de « Préparer » réservées à l'admin et à l'encadrement (revue croisée du 2026-10-08).
--
-- 0189 laissait tout compte connecté écrire SES clés (chatteur compris), alors que seul prepareImport
-- (admin et encadrement, requireImporter) en réserve : même garde de rôle que script_imports (0186).
-- Lecture, rattachement et libération restent « chacun ses clés ».
drop policy if exists script_prepare_requests_own on public.script_prepare_requests;
create policy script_prepare_requests_own on public.script_prepare_requests for all to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and ((select public.is_admin()) or (select public.is_manager()))
  );
