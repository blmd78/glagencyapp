-- 0002_rls.sql — Row-Level Security : cloisonnement par modèle.
-- L'ingestion écrit via le client service-role (bypass RLS) ; les utilisateurs ne font
-- que LIRE les faits/insights, et ÉCRIRE l'état éditable selon leur rôle.
-- Point de départ : admin = tout ; manager/member = ses modèles (à raffiner si besoin).

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function current_role_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function current_allowed_creator(c uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select current_role_is_admin()
      or exists (
        select 1 from profile_creators pc
        where pc.profile_id = auth.uid() and pc.creator_id = c
      );
$$;

-- ── Activation RLS ──────────────────────────────────────────────────────────
alter table creators             enable row level security;
alter table chatters             enable row level security;
alter table profiles             enable row level security;
alter table profile_creators     enable row level security;
alter table chatter_daily        enable row level security;
alter table creator_daily        enable row level security;
alter table chatter_period_stats enable row level security;
alter table insights             enable row level security;
alter table insight_states       enable row level security;
alter table bilans               enable row level security;
alter table quotas               enable row level security;
alter table transfers            enable row level security;
alter table payroll_config       enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
create policy profiles_self        on profiles for select using (id = auth.uid() or current_role_is_admin());
create policy profiles_admin_write on profiles for all    using (current_role_is_admin()) with check (current_role_is_admin());

-- ── creators / accès ────────────────────────────────────────────────────────
create policy creators_read        on creators for select using (current_allowed_creator(id));
create policy creators_admin_write on creators for all    using (current_role_is_admin()) with check (current_role_is_admin());
create policy pc_read              on profile_creators for select using (profile_id = auth.uid() or current_role_is_admin());
create policy pc_admin_write       on profile_creators for all    using (current_role_is_admin()) with check (current_role_is_admin());

-- ── chatters & faits (lecture selon l'équipe) ───────────────────────────────
create policy chatters_read on chatters for select
  using (creator_id is not null and current_allowed_creator(creator_id));

create policy chatter_daily_read on chatter_daily for select using (
  exists (select 1 from chatters c
          where c.id = chatter_id and c.creator_id is not null
            and current_allowed_creator(c.creator_id))
);
create policy creator_daily_read on creator_daily for select using (current_allowed_creator(creator_id));
create policy chatter_period_read on chatter_period_stats for select using (
  exists (select 1 from chatters c
          where c.id = chatter_id and c.creator_id is not null
            and current_allowed_creator(c.creator_id))
);

-- ── insights ────────────────────────────────────────────────────────────────
create policy insights_read on insights for select using (
  (creator_id is null and current_role_is_admin())
  or (creator_id is not null and current_allowed_creator(creator_id))
);

-- ── état éditable ───────────────────────────────────────────────────────────
create policy insight_states_rw on insight_states for all using (current_role_is_admin()) with check (current_role_is_admin());
create policy bilans_rw         on bilans         for all using (current_role_is_admin()) with check (current_role_is_admin());
create policy quotas_read       on quotas         for select using (current_allowed_creator(creator_id));
create policy quotas_write      on quotas         for all using (current_role_is_admin()) with check (current_role_is_admin());
create policy transfers_rw      on transfers      for all using (current_role_is_admin()) with check (current_role_is_admin());

-- ── paie (admin only) ───────────────────────────────────────────────────────
create policy payroll_admin on payroll_config for all using (current_role_is_admin()) with check (current_role_is_admin());
