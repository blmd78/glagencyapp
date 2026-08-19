-- 0124 — Roue des récompenses : classement hebdo réservé aux chatters ayant le droit Entraînement.
-- Revue finale de l'incrément 3 : `training_weekly_ranking` (0122) omettait le filtre
-- `'frm-entrainement' = any(p.pages)` que `training_overview_roster` applique déjà (0118/0119) —
-- un chatter qui perd le droit Entraînement restait classé, et donc éligible à un ticket. Même
-- garde ajoutée à `training_wheel_pending` : un profil sans ce droit (admin, encadrant sans
-- Entraînement) ne doit JAMAIS déclencher l'agrégat de classement hebdo — la pastille sidebar
-- appelle cette RPC à chaque rendu du layout `/formation`.

create or replace function public.training_weekly_ranking(p_week date)
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
language sql stable security definer set search_path = public, pg_temp
as $$
  with bounds as (
    select (p_week::timestamp at time zone 'Europe/Paris') as t0,
           ((p_week + 7)::timestamp at time zone 'Europe/Paris') as t1
  ),
  best as (
    select s.profile_id, s.case_id, max(s.total) as best_total, min(s.scored_at) as first_at
    from training_sessions s
    join training_cases c on c.id = s.case_id
    cross join bounds b
    where s.status = 'scored' and s.total is not null and c.kind <> 'boss'
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  )
  select b.profile_id, coalesce(p.display_name, '—'), sum(b.best_total)::integer, count(*)::integer,
         round(avg(b.best_total), 2)
  from best b
  join profiles p on p.id = b.profile_id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and ((select public.is_admin()) or (select public.has_page('formation')))
  group by b.profile_id, p.display_name
  order by 3 desc, 5 desc, min(b.first_at) asc;
$$;

-- ── Pastille sidebar / éligibilité : 1 = ticket non utilisé OU top 3 de la semaine passée non réclamé ──
create or replace function public.training_wheel_pending(p_profile uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when not exists (
      select 1 from profiles pp
      where pp.id = p_profile and pp.left_at is null and pp.role = 'chatteur' and 'frm-entrainement' = any(pp.pages)
    ) then 0
    when not (p_profile = (select auth.uid()) or (select public.has_page('frm-suivi'))) then 0
    when exists (select 1 from training_wheel_tickets t where t.profile_id = p_profile and t.used_at is null) then 1
    when exists (select 1 from training_wheel_tickets t where t.profile_id = p_profile and t.week = public.training_last_week()) then 0
    when exists (
      select 1
      from public.training_weekly_ranking(public.training_last_week()) with ordinality as r(profile_id, display_name, points, cases_done, avg_total, rn)
      where r.profile_id = p_profile and r.points > 0 and r.rn <= 3
    ) then 1
    else 0
  end;
$$;

revoke execute on function public.training_weekly_ranking(date) from public, anon;
revoke execute on function public.training_wheel_pending(uuid) from public, anon;
grant execute on function public.training_weekly_ranking(date) to authenticated;
grant execute on function public.training_wheel_pending(uuid) to authenticated;
