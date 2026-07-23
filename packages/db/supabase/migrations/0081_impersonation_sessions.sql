-- 0081 — État d'impersonation (source de vérité + teardown/TTL + audit). Écriture: service-role
-- (Server Actions) uniquement → aucune policy insert/update/delete. Lecture: admin/superadmin.
create table public.impersonation_sessions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references public.profiles(id) on delete cascade,
  target_id    uuid not null references public.profiles(id) on delete cascade,
  actor_email  text not null,
  target_email text not null,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  ended_at     timestamptz
);
create index impersonation_sessions_active_idx on public.impersonation_sessions (id) where ended_at is null;
-- FK indexées (convention repo, cf. 0055_fk_indexes).
create index impersonation_sessions_actor_id_idx on public.impersonation_sessions (actor_id);
create index impersonation_sessions_target_id_idx on public.impersonation_sessions (target_id);
alter table public.impersonation_sessions enable row level security;
create policy impersonation_sessions_read on public.impersonation_sessions for select to authenticated
  using ((select public.is_admin()));
