-- 0015 — Insights v2 « par modèle » (le v2 annoncé par 0011) : chaque carte porte les
-- ids des modèles concernés → un rôle `user` ne voit que les cartes touchant SES
-- modèles (profile_creators), et peut les traiter (les verrous métier restent dans
-- l'action serveur : bilan requis pour Résolu, Ignoré réservé admin, prise en charge).

-- Idempotent (rejouable).

alter table insights add column if not exists creator_ids uuid[] not null default '{}';

-- Backfill des générations existantes : les splits `models` (jsonb) portent le nom du
-- modèle — jointure par nom (les ids arrivent nativement aux prochaines générations).
update insights i
set creator_ids = coalesce(
  (select array_agg(distinct c.id)
     from jsonb_array_elements(i.models) e
     join creators c on c.name = e ->> 'name'),
  '{}'
)
where i.creator_ids = '{}';

create index if not exists insights_creator_ids_idx on insights using gin (creator_ids);

-- ── RLS v2 : admin = tout ; user = les cartes qui touchent au moins un de SES modèles.
drop policy if exists insights_admin_read on insights;
drop policy if exists insights_scoped_read on insights;
create policy insights_scoped_read on insights
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from profile_creators pc
      where pc.profile_id = auth.uid()
        and pc.creator_id = any (insights.creator_ids)
    )
  );

-- États de traitement : visibles/éditables si l'on voit la carte correspondante —
-- la visibilité passe par la RLS d'insights elle-même (pas de duplication de logique).
drop policy if exists insight_states_admin_read on insight_states;
drop policy if exists insight_states_admin_insert on insight_states;
drop policy if exists insight_states_admin_update on insight_states;
drop policy if exists insight_states_scoped_read on insight_states;
drop policy if exists insight_states_scoped_insert on insight_states;
drop policy if exists insight_states_scoped_update on insight_states;
create policy insight_states_scoped_read on insight_states
  for select to authenticated
  using (exists (select 1 from insights i where i.insight_key = insight_states.insight_key));
create policy insight_states_scoped_insert on insight_states
  for insert to authenticated
  with check (exists (select 1 from insights i where i.insight_key = insight_states.insight_key));
create policy insight_states_scoped_update on insight_states
  for update to authenticated
  using (exists (select 1 from insights i where i.insight_key = insight_states.insight_key))
  with check (exists (select 1 from insights i where i.insight_key = insight_states.insight_key));
