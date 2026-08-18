-- 0118 — Agrégats de progression PRÉ-CALCULÉS (perf : Ma formation / Overview / classement lisent
-- 1-2 lignes au lieu de rejouer les sessions comme GLA), maintenus par trigger à chaque notation ;
-- RPC de lecture (points faibles par axe, coût IA, classement, roster overview).
-- Règles (spec §6) : médailles/points/moyenne = SUR LES MEILLEURS totaux par cas, HORS boss ;
-- boss_best/boss_done à part (réussi = objectif atteint = note ≥ 60) ; streak = jours consécutifs
-- Europe/Paris avec ≥ 1 notation.

create table public.training_case_bests (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  case_id        uuid not null references public.training_cases(id) on delete cascade,
  best_total     smallint not null check (best_total between 0 and 100),
  best_objective boolean not null default false,
  attempts       integer not null default 1 check (attempts >= 1),
  last_at        timestamptz not null,
  primary key (profile_id, case_id)
);
create index training_case_bests_case_idx on public.training_case_bests (case_id);

create table public.training_profile_stats (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  cases_done      integer not null default 0,
  avg_total       numeric(5,2),
  points          integer not null default 0,
  boss_best       smallint,
  boss_done       boolean not null default false,
  active_days     integer not null default 0,
  streak_days     integer not null default 0,
  last_active_day date,
  last_session_at timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.training_case_bests enable row level security;
alter table public.training_profile_stats enable row level security;
-- Lecture : bests = propriétaire / encadrant / admin ; stats = tout membre Formation (classement =
-- agrégats, jamais de contenu). AUCUNE écriture authenticated : trigger security definer.
create policy training_case_bests_read on public.training_case_bests for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_profile_stats_read on public.training_profile_stats for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));

-- Recalcul DEPUIS LES SESSIONS (pas incrémental) : une re-notation à la baisse est prise en compte.
create or replace function public.training_refresh_stats(p_profile uuid, p_case uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_day date := (p_at at time zone 'Europe/Paris')::date;
  v_last date;
  v_streak integer;
  v_active integer;
begin
  select kind into v_kind from training_cases where id = p_case;

  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées
  insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
  select p_profile, p_case, max(total), bool_or(objective_reached), count(*), max(scored_at)
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored'
  on conflict (profile_id, case_id) do update
    set best_total = excluded.best_total, best_objective = excluded.best_objective,
        attempts = excluded.attempts, last_at = excluded.last_at;

  -- 2) stats du profil depuis ses bests (≤ ~90 lignes)
  select last_active_day, streak_days, active_days into v_last, v_streak, v_active
  from training_profile_stats where profile_id = p_profile;
  if v_last is null or v_last < v_day - 1 then v_streak := 1; v_active := coalesce(v_active, 0) + 1;
  elsif v_last = v_day - 1 then v_streak := coalesce(v_streak, 0) + 1; v_active := coalesce(v_active, 0) + 1;
  else v_streak := coalesce(v_streak, 1); v_active := coalesce(v_active, 1);   -- même jour
  end if;

  insert into training_profile_stats (profile_id, cases_done, avg_total, points, boss_best, boss_done,
                                      active_days, streak_days, last_active_day, last_session_at, updated_at)
  select p_profile,
         count(*) filter (where c.kind <> 'boss'),
         avg(b.best_total) filter (where c.kind <> 'boss'),
         coalesce(sum(b.best_total) filter (where c.kind <> 'boss'), 0),
         max(b.best_total) filter (where c.kind = 'boss'),
         coalesce(bool_or(b.best_objective) filter (where c.kind = 'boss'), false),
         v_active, v_streak, greatest(coalesce(v_last, v_day), v_day), p_at, now()
  from training_case_bests b join training_cases c on c.id = b.case_id
  where b.profile_id = p_profile
  on conflict (profile_id) do update
    set cases_done = excluded.cases_done, avg_total = excluded.avg_total, points = excluded.points,
        boss_best = excluded.boss_best, boss_done = excluded.boss_done,
        active_days = excluded.active_days, streak_days = excluded.streak_days,
        last_active_day = excluded.last_active_day, last_session_at = excluded.last_session_at, updated_at = now();
end;
$$;
revoke execute on function public.training_refresh_stats(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.training_on_session_scored()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform training_refresh_stats(new.profile_id, new.case_id, coalesce(new.scored_at, now()));
  return null;
end;
$$;
drop trigger if exists trg_training_session_scored on public.training_sessions;
create trigger trg_training_session_scored
  after update of status, scored_at on public.training_sessions
  for each row
  when (new.status = 'scored' and (old.status is distinct from 'scored' or old.scored_at is distinct from new.scored_at))
  execute function public.training_on_session_scored();

-- RPC lecture. INVOKER : bornées par la RLS de l'appelant.
create or replace function public.training_axis_profile(p_profile uuid)
returns table (axis_key text, axis_name text, avg_score numeric, n integer)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select a.axis_key, a.axis_name, round(avg(a.score), 1), count(*)::integer
  from training_thread_axis_scores a
  join training_threads t on t.id = a.thread_id
  join training_sessions s on s.id = t.session_id
  where s.profile_id = p_profile and s.status = 'scored' and s.kind <> 'boss'
  group by a.axis_key, a.axis_name
  order by avg(a.score) asc;
$$;

create or replace function public.training_ai_cost(p_since timestamptz)
returns table (day date, model text, kind text, calls integer, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select (created_at at time zone 'Europe/Paris')::date, model, kind, count(*)::integer,
         sum(input_tokens), sum(output_tokens), sum(cache_read_tokens)
  from training_ai_calls
  where created_at >= p_since
  group by 1, 2, 3
  order by 1 desc, 2, 3;
$$;

-- DEFINER : la RLS de profiles (profiles_self_admin_or_team_read) ne laisse pas un chatter/manager
-- lire tous les noms ; ces deux RPC ne renvoient que nom + agrégats, jamais de contenu.
create or replace function public.training_ranking()
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.profile_id, coalesce(p.display_name, p.email, '—'), s.points, s.cases_done, s.avg_total, s.boss_done, s.streak_days, coalesce(p.is_new, false)
  from training_profile_stats s
  join profiles p on p.id = s.profile_id
  where p.left_at is null
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$$;

create or replace function public.training_overview_roster()
returns table (profile_id uuid, display_name text, is_new boolean, arrived_at date, models text[],
               cases_done integer, avg_total numeric, points integer, boss_best smallint, boss_done boolean,
               streak_days integer, last_session_at timestamptz, sessions_scored integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.display_name, p.email, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         coalesce(s.streak_days, 0), s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored')
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$$;
