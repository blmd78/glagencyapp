-- 0087 — Hiérarchie : LECTURE transitive pour les managers (spec
-- docs/superpowers/specs/2026-07-28-hierarchie-lecture-transitive-design.md).
--
-- POURQUOI : un manager ne voyait que ses rattachés DIRECTS (manager_id = lui). Or la quasi-
-- totalité des chatteurs sont rattachés à des SOUS-MANAGERS : le sélecteur du Dashboard et la
-- lecture des comptes rendus étaient donc vides pour un manager. Décision Benoit (2026-07-28) :
-- un manager VOIT tout son sous-arbre (ses sous-managers ET leurs chatteurs).
--
-- VOIR ≠ ÉDITER. `manages()` (direct-only, 0054) est consommée par 10 policies, dont les
-- ÉCRITURES compta (compta_day_entries / compta_week_entries, USING + WITH CHECK). L'élargir
-- ouvrirait ces écritures en silence — c'est précisément ce qu'on ne veut pas. Donc
-- `manages()` reste INTOUCHÉE À DESSEIN, et une fonction sœur transitive est branchée
-- UNIQUEMENT sur les trois policies de LECTURE ci-dessous.
--
-- CE QUI NE CHANGE PAS (et doit le rester) :
--   • `manages()` — définition et ses consommateurs autres que les 3 policies ci-dessous ;
--   • écritures compta (compta_day_entries, compta_week_entries) : le manager ne saisit que
--     pour ses chatteurs DIRECTS ;
--   • police (police_entries, police_reports/_lines), planning (can_manage_planning_of),
--     to-do (can_write_todo_of) ;
--   • les gardes applicatives d'écriture (members/authz.ts, requireCanWriteTodo,
--     requireCanEdit planning) ;
--   • aucune table, aucune colonne, aucun index, aucun autre objet. L'index qui porte le
--     parcours de la CTE, `profiles_manager_id_idx` (manager_id), existe déjà depuis 0055.

-- managed_subtree() : les DESCENDANTS de l'appelant dans la chaîne manager_id (ses rattachés
-- directs, puis les rattachés de ceux-ci, …). L'appelant lui-même en est EXCLU — la branche
-- « soi » existe déjà séparément dans chacune des trois policies, on ne la duplique pas.
--
-- SANS PARAMÈTRE, à dessein : une fonction qui prend une colonne de la ligne
-- (`manages(profile_id)`) reste une sous-requête CORRÉLÉE, que Postgres ne peut pas réduire à
-- un InitPlan — elle s'exécute UNE FOIS PAR LIGNE. Consommée en `= any (array(select
-- managed_subtree()))`, la fonction ne dépend que de auth.uid() : elle devient un InitPlan
-- évalué UNE SEULE FOIS par requête (normes Supabase « RLS Performance and Best Practices »,
-- tests 5-6 : ×100 à ×450). C'est ce qui rend une CTE récursive acceptable dans une policy.
--
-- security definer OBLIGATOIRE (et pas seulement « comme ses sœurs ») : cette fonction lit
-- `profiles` et est appelée DEPUIS une policy DE `profiles` — en security invoker, évaluer la
-- policy relancerait la fonction, qui relancerait la policy, à l'infini. Le propriétaire
-- (`postgres`, rolbypassrls) lit `profiles` sans RLS et coupe la boucle. Même patron que
-- is_admin() / is_manager() / manages().
--
-- Profondeur bornée à 6 : garde anti-cycle. `profiles_manager_not_self` (0054) interdit
-- l'auto-rattachement mais PAS un cycle A→B→A, qui ferait boucler la récursive sans borne.
-- 6 niveaux couvrent très largement la hiérarchie réelle (admin > manager > sous-manager >
-- chatteur, soit 3 sauts au plus).
create or replace function public.managed_subtree()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  with recursive sub as (
    select id, 1 as depth
    from profiles
    where manager_id = (select auth.uid())
    union all
    select p.id, s.depth + 1
    from profiles p
    join sub s on p.manager_id = s.id
    where s.depth < 6
  )
  select id from sub;
$$;
revoke all on function public.managed_subtree() from public;
grant execute on function public.managed_subtree() to authenticated;

-- Les trois policies sont recréées à l'IDENTIQUE de leur définition en place (y compris les
-- sous-selects `(select …)` du pattern initPlan de 0057), à la SEULE exception de la branche
-- manager. Rien d'autre n'est retouché — pas même les appels non wrappés de daily_reports_read
-- (0064), pour que le diff se limite à ce que la spec autorise.

-- profiles : soi, admin, ou — pour un manager — TOUT son sous-arbre.
-- Avant : `manager_id = (select auth.uid())` (directs seulement).
drop policy if exists profiles_self_admin_or_team_read on public.profiles;
create policy profiles_self_admin_or_team_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_manager()) and id = any (array(select public.managed_subtree())))
  );

-- daily_reports : lecture des comptes rendus de tout le sous-arbre (le Dashboard d'un manager
-- doit pouvoir ouvrir le CR d'un chatteur rattaché à l'un de ses sous-managers).
-- Avant : `manages(profile_id)`.
drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated
  using (
    public.is_admin()
    or profile_id = (select auth.uid())
    or (public.is_manager() and profile_id = any (array(select public.managed_subtree())))
  );

-- profile_creators : sans elle, Membres afficherait les chatteurs du sous-arbre avec une
-- colonne Modèles vide. Avant : `manages(profile_id)`.
drop policy if exists profile_creators_self_admin_or_team_read on public.profile_creators;
create policy profile_creators_self_admin_or_team_read on public.profile_creators for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_manager()) and profile_id = any (array(select public.managed_subtree())))
  );
