-- 0120 — Classement de la formation : limité aux CHATTEURS (revue de Ma formation).
-- 0119 est déjà appliquée ET enregistrée sur UAT : on ne la réécrit pas, on `create or replace`
-- `training_ranking()` à l'identique (même signature, même retour, même security definer /
-- search_path, mêmes gardes is_admin() / has_page('formation')) en ajoutant `p.role = 'chatteur'`.
--
-- Pourquoi : la fonction renvoyait TOUT profil ayant une ligne de stats — un admin, un manager ou
-- un policier qui teste un cas pour vérifier le moteur apparaissait dans le classement des
-- chatteurs et faussait le rang de chacun. Même critère de population que
-- `training_overview_roster()` côté encadrement (chatteur avec le droit Entraînement) — ici on
-- s'arrête au rôle : un chatteur qui perd le droit garde son historique dans le classement.
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
    and p.role = 'chatteur'
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$$;
