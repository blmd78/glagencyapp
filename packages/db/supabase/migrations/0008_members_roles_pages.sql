-- 0008 — Membres & droits : role en text (pas d'enum), pages accessibles, email,
-- et RLS de cloisonnement réel par modèle via profile_creators (cf. spec 2026-07-03).

-- ── 1. profiles : role text + check, pages, email ────────────────────────────
alter table profiles alter column role drop default;
alter table profiles alter column role type text using role::text;
update profiles set role = 'user' where role not in ('admin');
alter table profiles add constraint profiles_role_check check (role in ('admin', 'user'));
alter table profiles alter column role set default 'user';
alter table profiles add column if not exists pages text[] not null default '{}';
alter table profiles add column if not exists email citext;

-- Backfill email depuis auth.users (le trigger le posera pour les suivants).
update profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is null;

-- ── 2. Trigger de provisioning : text + email (remplace la version enum 0002) ─
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, email)
  values (
    new.id,
    case
      when lower(new.email) in ('blmd8345@gmail.com', 'glbagencyy@gmail.com') then 'admin'
      else 'user'
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop type if exists app_role;

-- ── 3. Helper admin (security definer = pas de récursion RLS sur profiles) ───
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── 4. RLS : remplace les `using (true)` de 0004 ─────────────────────────────
-- Tables à creator_id : admin OU modèle assigné.
drop policy if exists creators_auth_read on creators;
create policy creators_scoped_read on creators for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = creators.id));

drop policy if exists creator_daily_auth_read on creator_daily;
create policy creator_daily_scoped_read on creator_daily for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = creator_daily.creator_id));

drop policy if exists chatter_creator_daily_auth_read on chatter_creator_daily;
create policy chatter_creator_daily_scoped_read on chatter_creator_daily for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = chatter_creator_daily.creator_id));

drop policy if exists chatter_creators_auth_read on chatter_creators;
create policy chatter_creators_scoped_read on chatter_creators for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = chatter_creators.creator_id));

-- Tables au grain tous-modèles : admin uniquement.
drop policy if exists chatter_daily_auth_read on chatter_daily;
create policy chatter_daily_admin_read on chatter_daily for select to authenticated
  using (public.is_admin());
drop policy if exists chatter_daily_reach_auth_read on chatter_daily_reach;
create policy chatter_daily_reach_admin_read on chatter_daily_reach for select to authenticated
  using (public.is_admin());
drop policy if exists chatter_alias_auth_read on chatter_alias;
create policy chatter_alias_admin_read on chatter_alias for select to authenticated
  using (public.is_admin());
drop policy if exists period_snapshot_kpi_auth_read on period_snapshot_kpi;
create policy period_snapshot_kpi_admin_read on period_snapshot_kpi for select to authenticated
  using (public.is_admin());
drop policy if exists teams_auth_read on teams;
create policy teams_admin_read on teams for select to authenticated
  using (public.is_admin());

-- chatters (noms) : admin OU membre avec au moins un modèle (pour la ventilation).
drop policy if exists chatters_auth_read on chatters;
create policy chatters_scoped_read on chatters for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc where pc.profile_id = auth.uid()));

-- profiles : soi-même ou admin en lecture ; écritures admin (le service-role bypasse de toute façon).
drop policy if exists profiles_auth_read on profiles;
create policy profiles_self_or_admin_read on profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profile_creators : lecture soi-même/admin ; écriture admin.
drop policy if exists profile_creators_auth_read on profile_creators;
create policy profile_creators_self_or_admin_read on profile_creators for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy profile_creators_admin_insert on profile_creators for insert to authenticated
  with check (public.is_admin());
create policy profile_creators_admin_delete on profile_creators for delete to authenticated
  using (public.is_admin());
