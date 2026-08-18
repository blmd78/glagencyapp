-- 0121 — Entraînement : durcissement du MODÈLE D'ÉCRITURE (revue finale de l'incrément 2).
--
-- Constat de la revue : les policies d'écriture « propriétaire » de 0117 donnaient au chatter un
-- accès PostgREST direct à ses propres lignes — donc bien plus que ce que l'UI propose :
--   * `training_sessions_update` acceptait N'IMPORTE QUELLE colonne → un chatter pouvait poser
--     lui-même `status = 'scored'`, `total = 100`, `scored_at = now()` ; le trigger 0118 propageait
--     ensuite le faux score dans training_case_bests, training_profile_stats et le classement ;
--   * `training_threads_write` / `training_messages_write` (`for all`) laissaient forger ou
--     supprimer des messages, remettre `turns_used` à 0, repousser `next_due_at` (chrono infini).
--
-- Décision : le modèle d'écriture devient celui, déjà en place, des scores et des appels IA —
-- TOUTES les écritures passent par les Server Actions en service-role, APRÈS la vérification
-- explicite de propriété (`profile_id = auth.uid()` lue avec le client utilisateur) ; la RLS de
-- ces tables devient de la LECTURE SEULE pour `authenticated`. Seul l'admin garde un UPDATE direct
-- sur les sessions (re-notation depuis l'Overview).
--
-- Aussi ici : (a) `training_refresh_stats` ne touche plus aux « meilleurs » quand le recalcul ne
-- trouve aucune session notée avec une note (l'agrégat rendait une ligne à `max(total) = null`,
-- soit une violation du NOT NULL de `training_case_bests.best_total`) ; (b) unicité applicative du
-- signalement (un par session) portée en base.

-- ---------- 1) RLS : plus aucune écriture `authenticated` sur sessions / threads / messages ----------
drop policy training_sessions_insert on public.training_sessions;
drop policy training_sessions_update on public.training_sessions;
drop policy training_threads_write on public.training_threads;
drop policy training_messages_write on public.training_messages;
drop policy training_reports_insert on public.training_reports;

-- L'admin conserve l'UPDATE direct des sessions (rescore) ; le reste (lecture propriétaire /
-- encadrant `frm-suivi` / admin) est inchangé — cf. les policies `*_read` de 0117.
create policy training_sessions_update_admin on public.training_sessions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------- 2) training_refresh_stats : ne jamais écrire un « meilleur » sans note ----------
-- `create or replace` à l'identique de 0119 (même signature, même security definer / search_path),
-- au détail près du garde `v_attempts > 0` : l'agrégat `max(total) / count(*)` rend TOUJOURS une
-- ligne, même quand aucune session ne correspond (max = null, count = 0) — l'upsert écrasait alors
-- un meilleur existant avec un total null (NOT NULL violé, notation en erreur).
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
  v_attempts integer;
begin
  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées AVEC une note
  -- (total is not null) : attempts compte les mêmes lignes que best_total ; coalesce sur
  -- best_objective/last_at pour ne jamais violer leur NOT NULL si ces colonnes nullables de
  -- training_sessions sont vides sur la ligne courante. Aucune session notée → on ne touche à rien.
  select count(*) into v_attempts
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored' and total is not null;

  if v_attempts > 0 then
    insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
    select p_profile, p_case, max(total), coalesce(bool_or(objective_reached), false), count(*), coalesce(max(scored_at), p_at)
    from training_sessions
    where profile_id = p_profile and case_id = p_case and status = 'scored' and total is not null
    on conflict (profile_id, case_id) do update
      set best_total = excluded.best_total, best_objective = excluded.best_objective,
          attempts = excluded.attempts, last_at = excluded.last_at;
  end if;

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

-- ---------- 3) Un signalement par session ----------
-- `reportScore` vérifiait déjà l'absence d'un signalement existant, mais deux envois concurrents
-- (double-clic, deux onglets) passaient tous les deux — et `get-session` n'en lit qu'un.
create unique index training_reports_session_uidx on public.training_reports (session_id);
