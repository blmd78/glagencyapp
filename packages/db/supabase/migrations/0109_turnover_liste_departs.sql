-- 0109 — Les départs NOMMÉS, à la place du comptage par motif (demande Benoit 2026-08-03).
--
-- `by_reason` rendait « Viré : 2, Démission : 1 ». Sur les volumes réels d'une agence — quelques
-- départs par mois — un histogramme apprend moins qu'une liste : savoir QUI est parti et pourquoi
-- est l'information qu'on vient chercher, le comptage se fait à l'œil sur trois lignes.
--
-- `tenure_days` accompagne chaque ligne : c'est la même mesure que la carte voisine, mais
-- individuelle. Null quand l'arrivée n'est pas saisie — l'écran affiche alors la ligne SANS
-- durée, plutôt que de l'exclure : le départ a eu lieu, seule son ancienneté est inconnue.
--
-- Pas de LIMIT : un départ est un événement rare, et tronquer une liste de départs sans le dire
-- serait exactement le genre de silence qu'on s'interdit ailleurs. Si le volume explosait un jour,
-- c'est la PÉRIODE qui doit être resserrée — elle est déjà à portée de main dans le header.

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
    'departures', coalesce((
      select json_agg(t order by t.left_at desc) from (
        select
          coalesce(p.display_name, p.email, '—') as name,
          p.left_reason as reason,
          p.left_at::text as left_at,
          -- Null si l'arrivée n'est pas connue : la ligne reste, sans durée.
          case when p.arrived_at is not null then (p.left_at - p.arrived_at) end as tenure_days
        from profiles p
        where p.role = 'chatteur' and p.left_at between p_from and p_to
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
