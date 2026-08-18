-- 0119 — Corrections post-revue de 0118 (findings importants acceptés par le contrôleur).
-- 0118 est déjà appliquée ET enregistrée sur UAT : cette migration ne fait que
-- `create or replace` les fonctions concernées (mêmes signatures, mêmes security/search_path).
--
-- 1) training_refresh_stats : `total is not null` ajouté au recalcul du meilleur (attempts
--    compte les mêmes lignes que best_total) ; coalesce sur best_objective/last_at (colonnes
--    nullables de training_sessions) pour ne jamais violer leur NOT NULL ; active_days
--    recalculé DEPUIS LES FAITS (jours distincts Europe/Paris avec ≥ 1 notation valide) au
--    lieu d'un compteur incrémental qui pouvait dériver en silence ; last_session_at repris
--    comme last_active_day (greatest(coalesce(existant, p_at), p_at), jamais de retour en
--    arrière) ; v_kind (déclaré, jamais utilisé) supprimé.
-- 2) training_ranking / training_overview_roster : plus de fallback e-mail dans display_name
--    (fuite d'adresse dans une RPC security definer lisible par tout chatter) ; streak_days
--    renvoyé devient la valeur EFFECTIVE (0 si le dernier jour actif est antérieur à hier
--    Paris) — training_profile_stats.streak_days, lui, reste la valeur brute « au dernier
--    jour actif » (cf. commentaire de colonne ci-dessous).
-- 3) Grants explicites sur les 4 RPC de lecture : execute retiré à public/anon, ré-accordé à
--    authenticated seul (agrégats/noms uniquement, jamais de contenu, mais pas d'appel anonyme).

comment on column public.training_profile_stats.streak_days is
$cmt$valeur au dernier jour actif — lire via la règle "effectif" (last_active_day ≥ hier Paris), sinon 0$cmt$;

comment on trigger trg_training_session_scored on public.training_sessions is
$cmt$trigger UPDATE-only : toujours créer la session en 'active' puis la passer 'scored' en posant scored_at (re-notation = nouveau scored_at)$cmt$;

create or replace function public.training_refresh_stats(p_profile uuid, p_case uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (p_at at time zone 'Europe/Paris')::date;
  v_last date;
  v_streak integer;
  v_active integer;
  v_last_session_at timestamptz;
begin
  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées AVEC une note
  -- (total is not null) : attempts compte les mêmes lignes que best_total ; coalesce sur
  -- best_objective/last_at pour ne jamais violer leur NOT NULL si ces colonnes nullables de
  -- training_sessions sont vides sur la ligne courante.
  insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
  select p_profile, p_case, max(total), coalesce(bool_or(objective_reached), false), count(*), coalesce(max(scored_at), p_at)
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored' and total is not null
  on conflict (profile_id, case_id) do update
    set best_total = excluded.best_total, best_objective = excluded.best_objective,
        attempts = excluded.attempts, last_at = excluded.last_at;

  -- 2) streak (incrémental — lu via la règle « effectif » côté RPC, cf. training_ranking /
  -- training_overview_roster) + reprise de last_session_at existant.
  select last_active_day, streak_days, last_session_at into v_last, v_streak, v_last_session_at
  from training_profile_stats where profile_id = p_profile;
  if v_last is null or v_last < v_day - 1 then v_streak := 1;
  elsif v_last = v_day - 1 then v_streak := coalesce(v_streak, 0) + 1;
  else v_streak := coalesce(v_streak, 1);   -- même jour
  end if;

  -- active_days recalculé DEPUIS LES FAITS (jours distincts Europe/Paris avec ≥ 1 notation
  -- valide) : plus un compteur incrémental qui pouvait dériver en silence.
  select count(distinct (scored_at at time zone 'Europe/Paris')::date) into v_active
  from training_sessions
  where profile_id = p_profile and status = 'scored' and total is not null;

  -- 3) stats du profil depuis ses bests (≤ ~90 lignes)
  insert into training_profile_stats (profile_id, cases_done, avg_total, points, boss_best, boss_done,
                                      active_days, streak_days, last_active_day, last_session_at, updated_at)
  select p_profile,
         count(*) filter (where c.kind <> 'boss'),
         avg(b.best_total) filter (where c.kind <> 'boss'),
         coalesce(sum(b.best_total) filter (where c.kind <> 'boss'), 0),
         max(b.best_total) filter (where c.kind = 'boss'),
         coalesce(bool_or(b.best_objective) filter (where c.kind = 'boss'), false),
         v_active, v_streak, greatest(coalesce(v_last, v_day), v_day),
         greatest(coalesce(v_last_session_at, p_at), p_at), now()
  from training_case_bests b join training_cases c on c.id = b.case_id
  where b.profile_id = p_profile
  on conflict (profile_id) do update
    set cases_done = excluded.cases_done, avg_total = excluded.avg_total, points = excluded.points,
        boss_best = excluded.boss_best, boss_done = excluded.boss_done,
        active_days = excluded.active_days, streak_days = excluded.streak_days,
        last_active_day = excluded.last_active_day, last_session_at = excluded.last_session_at, updated_at = now();
end;
$$;

-- DEFINER : la RLS de profiles (profiles_self_admin_or_team_read) ne laisse pas un chatter/manager
-- lire tous les noms ; ces deux RPC ne renvoient que nom + agrégats, jamais de contenu (plus d'e-mail
-- en repli), et le streak est la valeur EFFECTIVE (0 si le dernier jour actif est antérieur à hier).
create or replace function public.training_ranking()
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.profile_id, coalesce(p.display_name, '—'), s.points, s.cases_done, s.avg_total, s.boss_done,
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         coalesce(p.is_new, false)
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
  select p.id, coalesce(p.display_name, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored')
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$$;

-- Grants explicites : execute retiré à public/anon (pas d'appel anonyme), ré-accordé à authenticated.
revoke execute on function public.training_axis_profile(uuid), public.training_ai_cost(timestamptz),
                          public.training_ranking(), public.training_overview_roster()
  from public, anon;
grant execute on function public.training_axis_profile(uuid), public.training_ai_cost(timestamptz),
                        public.training_ranking(), public.training_overview_roster()
  to authenticated;
