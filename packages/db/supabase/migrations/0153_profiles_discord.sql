-- 0153 — Le pseudo Discord devient le nom affiché dans la Formation.
--
-- Décision Benoit 2026-09-11 : « afficher le pseudo Discord des chatters plutôt que leur
-- prénom/adresse mail ». Le pseudo n'existait que sur `recruit_candidates` (le dossier de
-- candidature) ; les écrans de la Formation lisent des `profiles`, qui ne l'avaient pas.
--
-- POURQUOI UNE COLONNE plutôt qu'une jointure : les quatre classements sont des RPC
-- `security definer` appelées à chaque rendu ; leur faire joindre `recruit_candidates` à
-- chaque ligne aurait lié un écran de formation au domaine du recrutement, et cassé pour les
-- 216 chatteurs entrés sans passer par le test.
--
-- CE QUE ÇA RÈGLE AU PASSAGE. `training_module_ranking` (0119:20) rendait encore
-- `coalesce(p.display_name, p.email, '—')` — le fallback e-mail que 0113 avait justement
-- retiré des autres classements pour cette raison, écrite à l'époque : « fuite d'adresse dans
-- une RPC security definer lisible par tout chatter ». Réintroduit six migrations plus tard.
-- Il ne se déclenchait pas (les 320 chatteurs actifs ont tous un display_name), mais il
-- attendait le premier compte créé sans nom. Il disparaît ici.
--
-- Le pseudo est OBLIGATOIRE à la fin de /postuler depuis le même jour : tout nouveau dossier
-- en porte un. La colonne reste nullable pour les anciens, d'où le `coalesce` vers
-- `display_name` — un chatteur sans pseudo garde son nom, il n'affiche jamais « — ».

alter table public.profiles
  add column if not exists discord text
  check (discord is null or (length(btrim(discord)) between 1 and 60));

comment on column public.profiles.discord is
  'Pseudo Discord — nom affiche dans toute la face Formation (classements compris), a la place '
  'du nom civil. Repris du dossier de candidature a la creation, editable ensuite dans Membres. '
  'NULL pour les chatteurs entres sans passer par /postuler : les RPC retombent sur display_name.';

-- Reprise des pseudos déjà saisis dans les dossiers de candidature. `lower()` comme à la
-- soumission (schema.ts normalise en minuscules) ; `nullif(btrim(...), '')` parce que les
-- dossiers d'avant le 2026-09-11 pouvaient porter une chaîne vide.
update public.profiles p
   set discord = lower(nullif(btrim(c.discord), ''))
  from public.recruit_candidates c
 where c.profile_id = p.id
   and p.discord is null
   and nullif(btrim(c.discord), '') is not null;

-- ── Les quatre classements rendent désormais `coalesce(discord, display_name, '—')` ────────
-- Corps REGÉNÉRÉS depuis `pg_get_functiondef` en production : identiques à l'octet près, hors
-- la ligne du nom (et le `group by` qui la suit). Aucune autre logique n'est touchée.

-- ── training_ranking ──
CREATE OR REPLACE FUNCTION public.training_ranking()
 RETURNS TABLE(profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select s.profile_id, coalesce(p.discord, p.display_name, '—'), s.points, s.cases_done, s.avg_total, s.boss_done,
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         coalesce(p.is_new, false)
  from training_profile_stats s
  join profiles p on p.id = s.profile_id
  where p.left_at is null
    and p.role = 'chatteur'
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$function$;

-- ── training_weekly_ranking ──
CREATE OR REPLACE FUNCTION public.training_weekly_ranking(p_week date)
 RETURNS TABLE(profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      and s.legacy_id is null
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  )
  select b.profile_id, coalesce(p.discord, p.display_name, '—'), sum(b.best_total)::integer, count(*)::integer,
         round(avg(b.best_total), 2)
  from best b
  join profiles p on p.id = b.profile_id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and ((select public.is_admin()) or (select public.has_page('formation')))
  group by b.profile_id, p.discord, p.display_name
  order by 3 desc, 5 desc, min(b.first_at) asc;
$function$;

-- ── training_overview_roster ──
CREATE OR REPLACE FUNCTION public.training_overview_roster()
 RETURNS TABLE(profile_id uuid, display_name text, is_new boolean, arrived_at date, models text[], cases_done integer, avg_total numeric, points integer, boss_best smallint, boss_done boolean, streak_days integer, last_session_at timestamp with time zone, sessions_scored integer, in_training boolean, has_training boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.id, coalesce(p.discord, p.display_name, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored'),
         coalesce(p.in_training, false),
         'frm-entrainement' = any(p.pages)
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur'
    and ('frm-entrainement' = any(p.pages) or coalesce(p.in_training, false))
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$function$;

-- ── training_module_ranking ──
CREATE OR REPLACE FUNCTION public.training_module_ranking(p_module uuid)
 RETURNS TABLE(profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select b.profile_id,
         coalesce(p.discord, p.display_name, '—'),
         sum(b.best_total)::integer,
         count(*)::integer,
         round(avg(b.best_total), 1)
  from training_case_bests b
  join training_cases c on c.id = b.case_id
  join profiles p on p.id = b.profile_id
  where c.module_id = p_module
    and c.kind <> 'boss'
    and c.active
    and p.left_at is null
    and ((select public.is_admin()) or (select public.has_page('formation')))
  group by b.profile_id, p.discord, p.display_name
  order by sum(b.best_total) desc, avg(b.best_total) desc nulls last;
$function$;
