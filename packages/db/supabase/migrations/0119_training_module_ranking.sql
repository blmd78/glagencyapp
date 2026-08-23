-- Classement PAR MODULE : le top 3 affiché sur la page d'un module et son onglet « Classement ».
--
-- Pourquoi une RPC et pas une lecture directe : la RLS de `training_case_bests` n'ouvre les
-- résultats qu'au propriétaire (plus encadrant Suivi / admin), et celle de `profiles` ne laisse
-- pas un chatter lire les noms de tous les autres. Un chatter ne peut donc PAS reconstituer ce
-- classement côté client — il faut du DEFINER.
--
-- Même patron de sécurité que `training_ranking` (0113_formation) : DEFINER + search_path figé,
-- porte d'entrée `is_admin() OR has_page('formation')`, et ne renvoie que des noms d'affichage et
-- des agrégats — jamais un contenu de conversation ni un secret de cas.
--
-- Périmètre des points : mêmes règles que le classement général — les MEILLEURS totaux par cas,
-- sur les cas ACTIFS du module, boss exclu (il se joue à part et ne compte pas dans un module).

create or replace function public.training_module_ranking(p_module uuid)
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
language sql stable security definer set search_path = public, pg_temp
as $$
  select b.profile_id,
         coalesce(p.display_name, p.email, '—'),
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
  group by b.profile_id, p.display_name, p.email
  order by sum(b.best_total) desc, avg(b.best_total) desc nulls last;
$$;

grant execute on function public.training_module_ranking(uuid) to authenticated;
