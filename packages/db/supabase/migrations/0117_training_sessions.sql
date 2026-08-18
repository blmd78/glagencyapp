-- 0117 — Entraînement : sessions (un cas joué), threads (1 solo / 5 défi / 5 boss), messages,
-- notation par thread + par axe, signalements, traçabilité des appels IA.
-- Spec : docs/superpowers/specs/2026-08-18-formation-entrainement-design.md §3.2, §3.4.
-- RLS : le chatter voit/écrit SES sessions ; encadrants (has_page('frm-suivi'), admin inclus) lisent tout
-- (Overview non cloisonné, décidé 2026-08-18) ; scores et ai_calls s'écrivent en service-role
-- depuis les Server Actions (aucune policy d'écriture authenticated). `session_id` est
-- dénormalisé sur training_messages : RLS à un niveau + index direct (table la plus lue).

create table public.training_sessions (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  case_id           uuid not null references public.training_cases(id) on delete restrict,
  module_id         uuid not null references public.training_modules(id) on delete restrict,
  kind              text not null check (kind in ('solo', 'arena', 'boss')),
  status            text not null default 'active' check (status in ('active', 'scored', 'failed', 'abandoned')),
  -- PARTIE VISIBLE du cas au moment joué : { code, title, phase, difficulty, context, objective,
  -- objectiveLabel, targetLine, maxTurns, reactionMaxS, isSale, moduleCode, moduleTitle } — jamais de secret.
  case_snapshot     jsonb not null,
  total             smallint check (total between 0 and 100),
  objective_reached boolean,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  scored_at         timestamptz
);
create index training_sessions_profile_started_idx on public.training_sessions (profile_id, started_at desc);
create index training_sessions_case_idx on public.training_sessions (case_id);
create index training_sessions_module_idx on public.training_sessions (module_id);
create index training_sessions_scored_idx on public.training_sessions (scored_at desc) where status = 'scored';
-- une seule session ACTIVE par chatter
create unique index training_sessions_one_active_idx on public.training_sessions (profile_id) where status = 'active';

create table public.training_threads (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.training_sessions(id) on delete cascade,
  position     smallint not null,
  ref_case_id  uuid references public.training_cases(id) on delete restrict,        -- défi : le solo rejoué
  boss_fan_id  uuid references public.training_case_boss_fans(id) on delete restrict, -- boss : le fan
  fan_name     text not null check (length(fan_name) between 1 and 30),
  status       text not null default 'open' check (status in ('open', 'done', 'lost')),
  lost_reason  text check (lost_reason is null or lost_reason ~ '^(timeout|[a-z_]{2,20})$'),
  turns_used   smallint not null default 0 check (turns_used >= 0),
  max_turns    smallint not null check (max_turns between 1 and 50),
  next_due_at  timestamptz,   -- chrono : le chatter doit répondre avant (null = pas de chrono en cours)
  unique (session_id, position)
);
create index training_threads_ref_case_idx on public.training_threads (ref_case_id);
create index training_threads_boss_fan_idx on public.training_threads (boss_fan_id);

create table public.training_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  thread_id   uuid not null references public.training_threads(id) on delete cascade,
  position    smallint not null,
  speaker     text not null check (speaker in ('chatter', 'fan')),
  body        text not null check (length(body) between 1 and 1000),
  media_price integer check (media_price is null or media_price between 1 and 10000),
  visible_at  timestamptz not null default now(),   -- révélation différée (défi/boss)
  created_at  timestamptz not null default now(),
  unique (thread_id, position)
);
create index training_messages_session_idx on public.training_messages (session_id);

create table public.training_thread_scores (
  thread_id         uuid primary key references public.training_threads(id) on delete cascade,
  total             smallint not null check (total between 0 and 100),
  objective_reached boolean not null,
  capped            boolean not null default false,
  comment           text not null,
  moments           jsonb not null default '[]'::jsonb,
  scored_at         timestamptz not null default now()
);
create table public.training_thread_axis_scores (
  thread_id uuid not null references public.training_threads(id) on delete cascade,
  axis_key  text not null,
  axis_name text not null,
  score     smallint not null check (score between 0 and 100),   -- 0-25 pour les axes de module, 0-100 pour les étapes du boss
  primary key (thread_id, axis_key)
);

create table public.training_reports (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  message     text not null check (length(message) between 1 and 2000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index training_reports_session_idx on public.training_reports (session_id);
create index training_reports_profile_idx on public.training_reports (profile_id);
create index training_reports_resolved_by_idx on public.training_reports (resolved_by);
create index training_reports_open_idx on public.training_reports (created_at desc) where resolved_at is null;

create table public.training_ai_calls (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.training_sessions(id) on delete cascade,
  thread_id         uuid references public.training_threads(id) on delete set null,
  kind              text not null check (kind in ('fan', 'score')),
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  latency_ms        integer not null default 0,
  ok                boolean not null default true,
  created_at        timestamptz not null default now()
);
create index training_ai_calls_session_idx on public.training_ai_calls (session_id);
create index training_ai_calls_thread_idx on public.training_ai_calls (thread_id);
create index training_ai_calls_created_idx on public.training_ai_calls (created_at desc);

alter table public.training_sessions enable row level security;
alter table public.training_threads enable row level security;
alter table public.training_messages enable row level security;
alter table public.training_thread_scores enable row level security;
alter table public.training_thread_axis_scores enable row level security;
alter table public.training_reports enable row level security;
alter table public.training_ai_calls enable row level security;

-- Sessions : propriétaire, encadrant, admin lisent ; propriétaire écrit ; admin peut mettre à jour (rescore).
-- « Encadrant » = has_page('frm-suivi') (droit Overview de la face Formation, admin inclus) — PAS is_manager()
-- (rôle manager seul) : un sous-manager ou un policier à qui on donne Suivi doit lire les sessions (spec §7).
create policy training_sessions_read on public.training_sessions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_sessions_insert on public.training_sessions for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy training_sessions_update on public.training_sessions for update to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()))
  with check (profile_id = (select auth.uid()) or (select public.is_admin()));

-- Threads : héritent de la session (exists — même patron que police_report_lines, 0071).
create policy training_threads_read on public.training_threads for select to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_threads_write on public.training_threads for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))));

-- Messages : session_id dénormalisé → un seul niveau.
create policy training_messages_read on public.training_messages for select to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_messages_write on public.training_messages for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))));

-- Scores : lecture via thread → session ; AUCUNE écriture authenticated (service-role depuis scoreSession).
create policy training_thread_scores_read on public.training_thread_scores for select to authenticated
  using (exists (select 1 from public.training_threads t join public.training_sessions s on s.id = t.session_id
                 where t.id = thread_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_thread_axis_scores_read on public.training_thread_axis_scores for select to authenticated
  using (exists (select 1 from public.training_threads t join public.training_sessions s on s.id = t.session_id
                 where t.id = thread_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));

-- Signalements : auteur + encadrants lisent ; auteur crée ; encadrant/admin résout.
create policy training_reports_read on public.training_reports for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_reports_insert on public.training_reports for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy training_reports_update on public.training_reports for update to authenticated
  using ((select public.has_page('frm-suivi')))
  with check ((select public.has_page('frm-suivi')));

-- Appels IA : admin lit ; écriture service-role uniquement.
create policy training_ai_calls_admin_read on public.training_ai_calls for select to authenticated
  using ((select public.is_admin()));
