-- 0091 — Lot SQL de l'audit empirique du 2026-07-29 (perf RLS mesurée + caps RPC + 2 fix).
-- Chaque point est chiffré par l'audit (EXPLAIN ANALYZE sous JWT simulé, UAT).
--
--  1) daily_reports : is_admin()/is_manager()/has_page() NUS, évalués PAR LIGNE (mesuré :
--     18 000 lignes → 493 ms / 71 652 buffers ; wrappé → 3,8 ms, ×130). 0064 avait recréé les
--     policies sans le wrap 0057, 0087 l'a reconduit. Sémantique identique, wrap seul.
--  2) snap_codes_read : même trou de convention (has_page nu).
--  3) todos : can_write_todo_of(profile_id) = 4 fonctions SECURITY DEFINER PAR LIGNE (mesuré :
--     1 200 lignes → 254-352 ms ; contrefactuel InitPlan → 2,7 ms). Même patron que
--     managed_subtree (0087) : une fonction SANS paramètre qui renvoie LE PÉRIMÈTRE entier,
--     consommée en `= any (array(select …))` → InitPlan évalué une fois par requête.
--     `can_write_todo_of` reste en place (miroir documentaire + compat), plus consommée ici.
--  4) crm_spenders_tracker : `relance_today` était borné par compteur_reset_at → un reset le
--     jour d'une relance faisait réapparaître la ligne « à relancer » alors que la contrainte
--     relances_one_per_day (par jour_paris, SANS notion de reset) refuse toute relance jusqu'au
--     lendemain. relance_today devient ABSOLU (la contrainte fait foi) ; compteur et
--     derniere_relance_at restent bornés au reset (le cycle repart bien de zéro).
--  5) crm_spenders_tracker_json : PostgREST cape AUSSI les rpc() set-returning à max_rows=1000
--     (prouvé : content-range 0-999/3038) — le fetchAll app ré-exécutait l'agrégation complète
--     à CHAQUE page (Function Scan, ~490 ms + 3,6 Mo par visite). Un wrapper json = 1 requête,
--     non plafonné, même RLS (invoker de bout en bout).
--  6) repos_data_weeks : le sélecteur de semaines rapatriait TOUTES les cases (une ligne par
--     case) pour un Set de ~3 valeurs — `distinct` en base, json non plafonné, RLS invoker.
--  7) save_repos_cell : SELECT FOR UPDATE ne verrouille RIEN sur une ligne INEXISTANTE →
--     TOCTOU résiduelle sur cellule neuve (2 non-admins concurrents). Un advisory xact lock
--     sur la clé de cellule sérialise aussi ce cas.

-- ── 1) daily_reports : wrap initPlan (recréées à l'identique, wrap seul) ─────────────────────
drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated
  using (
    (select public.is_admin())
    or profile_id = (select auth.uid())
    or ((select public.is_manager()) and profile_id = any (array(select public.managed_subtree())))
  );

drop policy if exists daily_reports_ins on public.daily_reports;
create policy daily_reports_ins on public.daily_reports for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select public.has_page('dashboard')));

drop policy if exists daily_reports_upd on public.daily_reports;
create policy daily_reports_upd on public.daily_reports for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and (select public.has_page('dashboard')));

drop policy if exists daily_reports_del on public.daily_reports;
create policy daily_reports_del on public.daily_reports for delete to authenticated
  using (profile_id = (select auth.uid()) and (select public.has_page('dashboard')));

-- ── 2) snap_codes_read : wrap initPlan ───────────────────────────────────────────────────────
drop policy if exists snap_codes_read on public.snap_codes;
create policy snap_codes_read on public.snap_codes for select to authenticated
  using ((select public.has_page('codes-snap')));

-- ── 3) todos : périmètre d'écriture en UNE requête (InitPlan) ────────────────────────────────
-- Traduction « set » EXACTE de can_write_todo_of(target), vérifiée contre les corps live de
-- can_edit_planning_of / can_manage_planning_of / is_admin / is_superadmin :
--   cible encadrante ET (
--     (appelant admin/superadmin ET (superadmin OU cible non admin/superadmin))   -- planning
--     OU (appelant manager ET cible sous-manager rattachée à lui)                 -- planning
--     OU (cible = soi ET appelant encadrant)                                      -- sa liste
--   )
-- SECURITY DEFINER : lit profiles depuis une policy (même patron/raison que managed_subtree).
create or replace function public.writable_todo_targets()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select id, role from profiles where id = (select auth.uid())
  )
  select t.id
  from profiles t, me
  where t.role in ('superadmin', 'admin', 'manager', 'sous-manager')
    and (
      (me.role in ('admin', 'superadmin')
        and (me.role = 'superadmin' or t.role not in ('admin', 'superadmin')))
      or (me.role = 'manager' and t.role = 'sous-manager' and t.manager_id = me.id)
      or (t.id = me.id and me.role in ('superadmin', 'admin', 'manager', 'sous-manager'))
    );
$$;
revoke execute on function public.writable_todo_targets() from public, anon;
grant execute on function public.writable_todo_targets() to authenticated;

drop policy if exists todos_select on public.todos;
create policy todos_select on public.todos for select to authenticated
  using (profile_id = any (array(select public.writable_todo_targets())));
drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos for insert to authenticated
  with check (profile_id = any (array(select public.writable_todo_targets())));
drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos for update to authenticated
  using (profile_id = any (array(select public.writable_todo_targets())))
  with check (profile_id = any (array(select public.writable_todo_targets())));
drop policy if exists todos_delete on public.todos;
create policy todos_delete on public.todos for delete to authenticated
  using (profile_id = any (array(select public.writable_todo_targets())));

-- ── 4) crm_spenders_tracker : relance_today ABSOLU (aligné sur relances_one_per_day) ─────────
-- Même signature/colonnes (create or replace) ; seul le lateral change : compteur et
-- derniere_relance_at restent bornés par compteur_reset_at (le cycle repart de zéro),
-- relance_today regarde le JOUR PARIS de la dernière relance TOUTE PÉRIODE — c'est la
-- contrainte d'unicité qui fait foi (1 relance/jour, reset ou pas).
create or replace function public.crm_spenders_tracker(p_seuil numeric default 40)
 returns table(creator_id uuid, fan_id bigint, username text, model text, ca_total numeric, status text, last_message_at timestamptz, last_message_is_mine boolean, has_unread boolean, assigned_chatter_id uuid, chatter_name text, assigned_label text, compteur_r integer, derniere_relance_at timestamptz, relance_today boolean, conversion_pending boolean, archived boolean)
 language sql
 stable
 set search_path to 'public'
as $$
  select
    sc.creator_id, sc.fan_id, sc.username, cr.name as model, sc.ca_total,
    sc.status, sc.last_message_at, sc.last_message_is_mine, sc.has_unread,
    sc.assigned_chatter_id, ch.display_name as chatter_name, sc.assigned_label,
    (coalesce(cm.compteur_base, 0) + coalesce(r.cnt, 0))::int as compteur_r,
    r.derniere_relance_at,
    (r.dernier_jour_abs = (now() at time zone 'Europe/Paris')::date) as relance_today,
    (r.derniere_relance_at is not null
       and sc.last_message_is_mine = false
       and sc.last_message_at > r.derniere_relance_at) as conversion_pending,
    coalesce(cm.archived, false) as archived
  from spender_conversations sc
  join creators cr on cr.id = sc.creator_id
  left join chatters ch on ch.id = sc.assigned_chatter_id
  left join spender_crm cm on cm.creator_id = sc.creator_id and cm.fan_id = sc.fan_id
  left join lateral (
    select count(*) filter (where rl.created_at > coalesce(cm.compteur_reset_at, '-infinity'::timestamptz)) as cnt,
           max(rl.created_at) filter (where rl.created_at > coalesce(cm.compteur_reset_at, '-infinity'::timestamptz)) as derniere_relance_at,
           max(rl.jour_paris) as dernier_jour_abs
    from relances rl
    where rl.creator_id = sc.creator_id and rl.fan_id = sc.fan_id
  ) r on true
  where sc.ca_total >= p_seuil
$$;

-- ── 5) Wrapper json non plafonné (1 requête au lieu de 8 pages ré-exécutées) ─────────────────
create or replace function public.crm_spenders_tracker_json(p_seuil numeric default 40)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from public.crm_spenders_tracker(p_seuil) t;
$$;
revoke execute on function public.crm_spenders_tracker_json(numeric) from public, anon;
grant execute on function public.crm_spenders_tracker_json(numeric) to authenticated;

-- ── 6) Semaines avec données (sélecteur repos) : distinct en base, json non plafonné ─────────
-- SECURITY INVOKER : la RLS rest_cells_read (has_page('repos')) s'applique telle quelle.
create or replace function public.repos_data_weeks()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(json_agg(w.week_start order by w.week_start), '[]'::json)
  from (select distinct week_start from rest_planning_cells) w;
$$;
revoke execute on function public.repos_data_weeks() from public, anon;
grant execute on function public.repos_data_weeks() to authenticated;

-- ── 7) save_repos_cell : advisory xact lock — la TOCTOU couvre aussi la cellule NEUVE ────────
-- (SELECT FOR UPDATE ne pose aucun verrou quand la ligne n'existe pas : deux non-admins
-- concurrents sur une cellule neuve validaient chacun leur delta sur '{}'.) Corps identique à
-- 0090 sinon.
create or replace function public.save_repos_cell(
  p_week_start date,
  p_day smallint,
  p_col text,
  p_chatter_ids uuid[],
  p_names text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before uuid[];
  v_bad int;
begin
  if not public.can_write_page('repos') then
    raise exception 'repos_acces_refuse';
  end if;
  if p_col not in ('g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'managers', 'policiers') then
    raise exception 'repos_colonne_inconnue';
  end if;
  if length(coalesce(p_names, '')) > 1000 then
    raise exception 'repos_names_trop_long';
  end if;
  if coalesce(array_length(p_chatter_ids, 1), 0) > 200
     or exists (select 1 from unnest(p_chatter_ids) x(id) where x.id is null) then
    raise exception 'repos_ids_invalides';
  end if;

  if not public.is_admin() then
    if p_col in ('managers', 'policiers') then
      raise exception 'repos_colonne_encadrement';
    end if;
    -- Verrou de CLÉ (pas de ligne) : sérialise aussi les cellules qui n'existent pas encore —
    -- relâché en fin de transaction.
    perform pg_advisory_xact_lock(hashtextextended('repos_cell:' || p_week_start::text || ':' || p_day || ':' || p_col, 0));
    select chatter_ids into v_before
    from rest_planning_cells
    where week_start = p_week_start and day = p_day and col = p_col
    for update;
    v_before := coalesce(v_before, '{}');

    select count(*) into v_bad
    from (
      (select unnest(p_chatter_ids) except select unnest(v_before))
      union
      (select unnest(v_before) except select unnest(p_chatter_ids))
    ) d(id)
    where d.id not in (select public.managed_subtree());
    if v_bad > 0 then
      raise exception 'repos_hors_equipe';
    end if;
  end if;

  insert into rest_planning_cells (week_start, day, col, chatter_ids, names, updated_at, updated_by)
  values (p_week_start, p_day, p_col, p_chatter_ids, trim(coalesce(p_names, '')), now(), (select auth.uid()))
  on conflict (week_start, day, col) do update
    set chatter_ids = excluded.chatter_ids,
        names       = excluded.names,
        updated_at  = excluded.updated_at,
        updated_by  = excluded.updated_by;
end;
$$;
