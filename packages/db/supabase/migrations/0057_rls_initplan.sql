-- 0057 — Optimisation RLS `initplan` (advisor Supabase `auth_rls_initplan`).
-- Wrappe is_admin()/is_superadmin()/is_manager()/has_page()/manages()/auth.uid() en `(select …)` :
-- Postgres l'évalue UNE fois par requête (InitPlan) au lieu d'UNE fois PAR LIGNE. Sémantique
-- identique (sous-requête scalaire = même valeur). Généré depuis les définitions réelles ; les
-- appels déjà wrappés (ex. owner_id des policies mkt) sont laissés intacts.

alter policy "chatter_alias_admin_read" on public."chatter_alias"
  using ((select is_admin()));
alter policy "chatter_creator_daily_scoped_read" on public."chatter_creator_daily"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = (select auth.uid())) AND (pc.creator_id = chatter_creator_daily.creator_id))))));
alter policy "chatter_creators_scoped_read" on public."chatter_creators"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = (select auth.uid())) AND (pc.creator_id = chatter_creators.creator_id))))));
alter policy "chatter_daily_admin_read" on public."chatter_daily"
  using ((select is_admin()));
alter policy "chatter_daily_reach_admin_read" on public."chatter_daily_reach"
  using ((select is_admin()));
alter policy "chatters_crm_update" on public."chatters"
  using ((select has_page('chatters'::text)))
  with check ((select has_page('chatters'::text)));
alter policy "chatters_scoped_read" on public."chatters"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE (pc.profile_id = (select auth.uid()))))));
alter policy "day_entries_admin_all" on public."compta_day_entries"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "day_entries_member_insert" on public."compta_day_entries"
  with check ((select has_page('compta'::text)));
alter policy "day_entries_member_read" on public."compta_day_entries"
  using ((select has_page('compta'::text)));
alter policy "day_entries_member_update" on public."compta_day_entries"
  using ((select has_page('compta'::text)))
  with check ((select has_page('compta'::text)));
alter policy "compta_debts_admin_all" on public."compta_debts"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "compta_payments_admin_all" on public."compta_payments"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "payments_member_read" on public."compta_payments"
  using ((select has_page('compta'::text)));
alter policy "compta_primes_admin_all" on public."compta_primes"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "compta_settings_admin_all" on public."compta_settings"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "compta_week_entries_admin_all" on public."compta_week_entries"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "week_entries_member_insert" on public."compta_week_entries"
  with check ((select has_page('compta'::text)));
alter policy "week_entries_member_read" on public."compta_week_entries"
  using ((select has_page('compta'::text)));
alter policy "week_entries_member_update" on public."compta_week_entries"
  using ((select has_page('compta'::text)))
  with check ((select has_page('compta'::text)));
alter policy "creator_daily_scoped_read" on public."creator_daily"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = (select auth.uid())) AND (pc.creator_id = creator_daily.creator_id))))));
alter policy "creator_script_daily_scoped_read" on public."creator_script_daily"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = (select auth.uid())) AND (pc.creator_id = creator_script_daily.creator_id))))));
alter policy "creators_admin_update" on public."creators"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "creators_scoped_read" on public."creators"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = (select auth.uid())) AND (pc.creator_id = creators.id))))));
alter policy "daily_reports_del" on public."daily_reports"
  using (((profile_id = ( SELECT auth.uid() AS uid)) AND ((select is_admin()) OR (select has_page('dashboard'::text)))));
alter policy "daily_reports_ins" on public."daily_reports"
  with check (((profile_id = ( SELECT auth.uid() AS uid)) AND ((select is_admin()) OR (select has_page('dashboard'::text)))));
alter policy "daily_reports_read" on public."daily_reports"
  using (((select is_superadmin()) OR (profile_id = ( SELECT auth.uid() AS uid))));
alter policy "daily_reports_upd" on public."daily_reports"
  using ((profile_id = ( SELECT auth.uid() AS uid)))
  with check (((profile_id = ( SELECT auth.uid() AS uid)) AND ((select is_admin()) OR (select has_page('dashboard'::text)))));
alter policy "fan_transactions_read" on public."fan_transactions"
  using (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "insights_scoped_read" on public."insights"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = (select auth.uid())) AND (pc.creator_id = ANY (insights.creator_ids)))))));
alter policy "mkt_link_daily_all" on public."mkt_link_daily"
  using ((select has_page('marketing'::text)))
  with check ((select has_page('marketing'::text)));
alter policy "mkt_links_all" on public."mkt_links"
  using ((select has_page('marketing'::text)))
  with check ((select has_page('marketing'::text)));
alter policy "mkt_social_accounts_all" on public."mkt_social_accounts"
  using ((select has_page('marketing'::text)))
  with check ((select has_page('marketing'::text)));
alter policy "mkt_social_daily_all" on public."mkt_social_daily"
  using ((select has_page('marketing'::text)))
  with check ((select has_page('marketing'::text)));
alter policy "mkt_staff_own" on public."mkt_staff"
  using (((select has_page('marketing'::text)) AND ((select is_admin()) OR (owner_id = ( SELECT auth.uid() AS uid)))))
  with check (((select has_page('marketing'::text)) AND ((select is_admin()) OR (owner_id = ( SELECT auth.uid() AS uid)))));
alter policy "period_snapshot_kpi_admin_read" on public."period_snapshot_kpi"
  using ((select is_admin()));
alter policy "plannings_read" on public."plannings"
  using (((select is_admin()) OR (profile_id = ( SELECT auth.uid() AS uid))));
alter policy "police_delete" on public."police_entries"
  using ((select is_admin()));
alter policy "police_insert" on public."police_entries"
  with check ((select has_page('police'::text)));
alter policy "police_read" on public."police_entries"
  using ((select has_page('police'::text)));
alter policy "police_update" on public."police_entries"
  using ((select has_page('police'::text)))
  with check ((select has_page('police'::text)));
alter policy "profile_creators_admin_delete" on public."profile_creators"
  using ((select is_admin()));
alter policy "profile_creators_admin_insert" on public."profile_creators"
  with check ((select is_admin()));
alter policy "profile_creators_self_admin_or_team_read" on public."profile_creators"
  using (((profile_id = (select auth.uid())) OR (select is_admin()) OR ((select is_manager()) AND (select manages(profile_id)))));
alter policy "profiles_admin_write" on public."profiles"
  using (((select is_admin()) AND ((role <> 'superadmin'::text) OR (select is_superadmin()))))
  with check (((select is_admin()) AND ((role <> 'superadmin'::text) OR (select is_superadmin()))));
alter policy "profiles_self_admin_or_team_read" on public."profiles"
  using (((id = (select auth.uid())) OR (select is_admin()) OR ((select is_manager()) AND (manager_id = (select auth.uid())))));
alter policy "quotas_admin_delete" on public."quotas"
  using ((select is_admin()));
alter policy "quotas_admin_insert" on public."quotas"
  with check ((select is_admin()));
alter policy "quotas_admin_update" on public."quotas"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "relances_insert" on public."relances"
  with check (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "relances_read" on public."relances"
  using (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "rest_cells_read" on public."rest_planning_cells"
  using ((select has_page('repos'::text)));
alter policy "rest_cells_update" on public."rest_planning_cells"
  using ((select has_page('repos'::text)))
  with check ((select has_page('repos'::text)));
alter policy "rest_cells_write" on public."rest_planning_cells"
  with check ((select has_page('repos'::text)));
alter policy "rest_colmembers_read" on public."rest_planning_column_members"
  using ((select has_page('repos'::text)));
alter policy "rest_colmembers_write" on public."rest_planning_column_members"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "rest_weeks_read" on public."rest_planning_weeks"
  using ((select has_page('repos'::text)));
alter policy "rest_weeks_update" on public."rest_planning_weeks"
  using ((select has_page('repos'::text)))
  with check ((select has_page('repos'::text)));
alter policy "rest_weeks_write" on public."rest_planning_weeks"
  with check ((select has_page('repos'::text)));
alter policy "script_items_admin_del" on public."script_items"
  using ((select is_admin()));
alter policy "script_items_admin_ins" on public."script_items"
  with check ((select is_admin()));
alter policy "script_items_admin_upd" on public."script_items"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "script_items_scoped_read" on public."script_items"
  using (((select is_admin()) OR (EXISTS ( SELECT 1
   FROM profile_creators pc
  WHERE ((pc.profile_id = ( SELECT auth.uid() AS uid)) AND (pc.creator_id = script_items.creator_id))))));
alter policy "snap_codes_admin_all" on public."snap_codes"
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy "spender_assignment_events_read" on public."spender_assignment_events"
  using (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "spender_conversations_read" on public."spender_conversations"
  using (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "spender_crm_read" on public."spender_crm"
  using (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "spender_crm_write" on public."spender_crm"
  using (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))))
  with check (((select has_page('crm-spenders'::text)) AND ((select is_admin()) OR (creator_id IN ( SELECT profile_creators.creator_id
   FROM profile_creators
  WHERE (profile_creators.profile_id = (select auth.uid())))))));
alter policy "teams_admin_read" on public."teams"
  using ((select is_admin()));

