-- 0108 — L'effectif revient dans la série, mais comme COURBE À PART (demande Benoit 2026-08-03).
--
-- 0107 l'avait sorti du graphe : mélangé aux barres d'arrivées et de départs, un NIVEAU entrait en
-- concurrence visuelle avec des FLUX qui ne se lisent pas sur la même échelle. Il revient dans son
-- propre onglet, à côté de « Arrivées et départs » qui reste la vue par défaut — deux questions
-- distinctes, deux graphes, une seule carte.
--
-- PRÉSENT AU JOUR D = arrivé au plus tard ce jour-là, et pas encore parti. Le jour du départ, la
-- personne est ENCORE COMPTÉE (`left_at > j.d` et non `>=`) : elle a travaillé ce jour-là.
--
-- `coalesce(arrived_at, created_at::date)` : au démarrage aucun chatteur n'a de date d'arrivée
-- saisie. Sans ce repli, l'effectif serait à zéro sur toute la courbe. Conséquence à connaître —
-- et que le bandeau de la vue annonce : avant le peuplement du CRM (17-29 juillet 2026), la courbe
-- monte d'un coup au lieu de refléter des arrivées réelles.

create or replace function public.turnover_report(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with jours as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  par_jour as (
    select
      to_char(j.d, 'YYYY-MM-DD') as jour,
      (select count(*) from profiles p
        where p.role = 'chatteur' and p.arrived_at = j.d) as entrees,
      (select count(*) from profiles p
        where p.role = 'chatteur' and p.left_at = j.d) as sorties,
      (select count(*) from profiles p
        where p.role = 'chatteur'
          and coalesce(p.arrived_at, p.created_at::date) <= j.d
          and (p.left_at is null or p.left_at > j.d)) as effectif
    from jours j
  )
  select json_build_object(
    'by_day', coalesce((select json_agg(t order by t.jour) from par_jour t), '[]'::json),
    'headcount', (select count(*) from profiles where role = 'chatteur' and left_at is null),
    'by_reason', coalesce((
      select json_agg(t) from (
        select left_reason as reason, count(*) as n
        from profiles
        where role = 'chatteur' and left_at between p_from and p_to and left_reason is not null
        group by left_reason
      ) t
    ), '[]'::json),
    'tenure', (
      select json_build_object(
        'sum_days', coalesce(sum(left_at - arrived_at), 0),
        'known', count(*),
        'exits', (select count(*) from profiles
                   where role = 'chatteur' and left_at between p_from and p_to)
      )
      from profiles
      where role = 'chatteur' and left_at between p_from and p_to and arrived_at is not null
    )
  );
$$;

revoke execute on function public.turnover_report(date, date) from public, anon;
grant execute on function public.turnover_report(date, date) to authenticated;
