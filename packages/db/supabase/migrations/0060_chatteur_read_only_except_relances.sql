-- 0060 — Restriction CHATTEUR : lecture seule PARTOUT sauf les relances.
--
-- Décision produit : un `chatteur` ne peut écrire QUE `addRelance` (avancer R1→R10 dans le
-- tracker spenders). Toutes les autres écritures passent admin OU manager/sous-manager.
-- Un chatteur GARDE la LECTURE de ses pages (policies `*_read` inchangées) — seule
-- l'écriture est fermée.
--
-- Mécanisme : nouveau helper `can_write_page(slug)` = admin, OU manager/sous-manager ayant
-- la page. Chaque policy d'écriture page-gated passe de `has_page(slug)` à
-- `can_write_page(slug)` ; un chatteur (has_page vrai mais ni admin ni manager) est exclu.
-- Les conditions de périmètre (creator_id ∈ profile_creators, owner_id, profile_id) sont
-- PRÉSERVÉES à l'identique — managers/admins inchangés.
--
-- HORS scope (inchangé) :
--   • relances (INSERT/READ) : reste `has_page('crm-spenders')` → LE seul write du chatteur.
--   • compta_*_member_* : EXCLU. Ces policies n'ont pas de migration `create policy` committée
--     (dérive prod connue) et `compta/actions.ts` est un stub → aucun write compta réel côté
--     app. Elles seront gate correctement quand la feature compta aura ses vraies migrations.
--   • Policies déjà admin-only (creators, quotas, snap_codes, script_items, plannings,
--     profiles, rest_colmembers, police_delete…) : un chatteur ne les passait déjà pas.

-- Helper : droit d'ÉCRITURE d'une page. security invoker (compose is_admin/is_manager/
-- has_page qui font, eux, le lookup privilégié) ; search_path figé (advisor).
create or replace function public.can_write_page(slug text)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_admin() or (public.is_manager() and public.has_page(slug));
$$;
revoke all on function public.can_write_page(text) from public;
grant execute on function public.can_write_page(text) to authenticated;

-- ── spenders CRM (archiver / reset compteur) — addRelance NON concerné (table relances) ──
alter policy "spender_crm_write" on public."spender_crm"
  using (((select public.can_write_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))))
  with check (((select public.can_write_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));

-- ── chatters (CRM : role/team/shift) ──
alter policy "chatters_crm_update" on public."chatters"
  using ((select public.can_write_page('chatters'::text)))
  with check ((select public.can_write_page('chatters'::text)));

-- ── insights (traiter une carte) — visibilité-gated : on AJOUTE le gate admin/manager ──
alter policy "insight_states_scoped_insert" on public."insight_states"
  with check ((((select is_admin()) OR (select is_manager())) AND (EXISTS ( SELECT 1
   FROM insights i
  WHERE (i.insight_key = insight_states.insight_key)))));
alter policy "insight_states_scoped_update" on public."insight_states"
  using ((((select is_admin()) OR (select is_manager())) AND (EXISTS ( SELECT 1
   FROM insights i
  WHERE (i.insight_key = insight_states.insight_key)))))
  with check ((((select is_admin()) OR (select is_manager())) AND (EXISTS ( SELECT 1
   FROM insights i
  WHERE (i.insight_key = insight_states.insight_key)))));

-- ── police (warnings / malus) — police_delete déjà admin-only ──
alter policy "police_insert" on public."police_entries"
  with check ((select public.can_write_page('police'::text)));
alter policy "police_update" on public."police_entries"
  using ((select public.can_write_page('police'::text)))
  with check ((select public.can_write_page('police'::text)));

-- ── repos (planning) — rest_colmembers déjà admin-only ──
alter policy "rest_cells_update" on public."rest_planning_cells"
  using ((select public.can_write_page('repos'::text)))
  with check ((select public.can_write_page('repos'::text)));
alter policy "rest_cells_write" on public."rest_planning_cells"
  with check ((select public.can_write_page('repos'::text)));
alter policy "rest_weeks_update" on public."rest_planning_weeks"
  using ((select public.can_write_page('repos'::text)))
  with check ((select public.can_write_page('repos'::text)));
alter policy "rest_weeks_write" on public."rest_planning_weeks"
  with check ((select public.can_write_page('repos'::text)));

-- ── marketing (liens / social / staff) ──
alter policy "mkt_link_daily_all" on public."mkt_link_daily"
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
alter policy "mkt_links_all" on public."mkt_links"
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
alter policy "mkt_social_accounts_all" on public."mkt_social_accounts"
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
alter policy "mkt_social_daily_all" on public."mkt_social_daily"
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
alter policy "mkt_staff_own" on public."mkt_staff"
  using (((select public.can_write_page('marketing'::text)) AND ((select is_admin()) OR (owner_id = ( SELECT auth.uid() AS uid)))))
  with check (((select public.can_write_page('marketing'::text)) AND ((select is_admin()) OR (owner_id = ( SELECT auth.uid() AS uid)))));

-- ── daily_reports (compte-rendu quotidien) — self-owned + can_write_page('dashboard') ──
alter policy "daily_reports_ins" on public."daily_reports"
  with check (((profile_id = ( SELECT auth.uid() AS uid)) AND (select public.can_write_page('dashboard'::text))));
alter policy "daily_reports_upd" on public."daily_reports"
  using (((profile_id = ( SELECT auth.uid() AS uid)) AND (select public.can_write_page('dashboard'::text))))
  with check (((profile_id = ( SELECT auth.uid() AS uid)) AND (select public.can_write_page('dashboard'::text))));
alter policy "daily_reports_del" on public."daily_reports"
  using (((profile_id = ( SELECT auth.uid() AS uid)) AND (select public.can_write_page('dashboard'::text))));
