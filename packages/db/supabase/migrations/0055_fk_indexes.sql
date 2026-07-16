-- 0055 — Index sur les clés étrangères non couvertes (advisor Supabase `unindexed_foreign_keys`).
-- Sans index, un DELETE sur la table référencée (souvent `profiles`/`creators`/`chatters`) force
-- un seq scan de la table référençante pour valider la FK ; et les filtres/jointures sur ces
-- colonnes (manager_id, owner_id, creator_id…) sont non indexés. `if not exists` = idempotent.
-- Colonnes d'audit (updated_by/created_by/paid_by) incluses pour un advisor 100 % vert : coût
-- disque marginal, aucun risque.

-- Rattachements & cloisonnement (réellement filtrés)
create index if not exists profiles_manager_id_idx                on public.profiles (manager_id);
create index if not exists mkt_staff_owner_id_idx                 on public.mkt_staff (owner_id);
create index if not exists mkt_links_creator_id_idx               on public.mkt_links (creator_id);
create index if not exists mkt_social_accounts_creator_id_idx     on public.mkt_social_accounts (creator_id);
create index if not exists mkt_social_accounts_staff_id_idx       on public.mkt_social_accounts (staff_id);
create index if not exists mkt_staff_links_link_id_idx            on public.mkt_staff_links (link_id);
create index if not exists relances_chatter_id_idx               on public.relances (chatter_id);
create index if not exists spender_assignment_events_from_chatter_id_idx on public.spender_assignment_events (from_chatter_id);
create index if not exists spender_assignment_events_to_chatter_id_idx   on public.spender_assignment_events (to_chatter_id);
create index if not exists police_entries_controller_id_idx       on public.police_entries (controller_id);

-- Colonnes d'audit "qui a modifié" (peu filtrées, mais l'advisor les flag → couverture complète)
create index if not exists quotas_updated_by_idx                  on public.quotas (updated_by);
create index if not exists insight_states_updated_by_idx          on public.insight_states (updated_by);
create index if not exists compta_settings_updated_by_idx         on public.compta_settings (updated_by);
create index if not exists compta_week_entries_updated_by_idx     on public.compta_week_entries (updated_by);
create index if not exists compta_day_entries_updated_by_idx      on public.compta_day_entries (updated_by);
create index if not exists compta_primes_updated_by_idx           on public.compta_primes (updated_by);
create index if not exists compta_payments_paid_by_idx            on public.compta_payments (paid_by);
create index if not exists rest_planning_cells_updated_by_idx     on public.rest_planning_cells (updated_by);
create index if not exists rest_planning_weeks_updated_by_idx     on public.rest_planning_weeks (updated_by);
create index if not exists rest_planning_column_members_updated_by_idx on public.rest_planning_column_members (updated_by);
create index if not exists plannings_updated_by_idx               on public.plannings (updated_by);
create index if not exists script_items_updated_by_idx            on public.script_items (updated_by);
create index if not exists mkt_staff_payments_created_by_idx      on public.mkt_staff_payments (created_by);
create index if not exists relances_created_by_idx               on public.relances (created_by);
