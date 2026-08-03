-- 0110 — Le RPC cesse de calculer ce que `departures` porte déjà (audit 2026-08-03).
--
-- 0109 renvoyait un bloc `tenure` — `exits`, `known`, `sum_days` — issu de sous-requêtes sur
-- EXACTEMENT la même population que `departures`, qui contient déjà chaque durée individuelle.
-- Trois agrégats calculés en base pour des chiffres que trois lignes de JS tirent d'un tableau de
-- quelques éléments.
--
-- LE VRAI GAIN N'EST PAS LA PERFORMANCE, c'est l'IMPOSSIBILITÉ DE DIVERGER. Tant que les deux
-- coexistaient, l'écran pouvait afficher « 3 départs » au-dessus d'une liste qui en montrait 2 —
-- un décalage qu'aucun test n'aurait attrapé, et qui aurait fait douter de tout le reste.
-- Désormais la moyenne et la liste viennent de la même source, par construction.
--
-- Le RPC garde ce que le JS ne peut PAS dériver : la série quotidienne (qui exige
-- `generate_series` et une agrégation par jour) et l'effectif courant.

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
      -- Présent ce jour-là = arrivé au plus tard ce jour, pas encore parti. Le jour du départ, la
      -- personne est encore comptée : elle a travaillé ce jour-là.
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
          -- Null si l'arrivée n'est pas connue : la ligne reste, sans durée. C'est aussi ce qui
          -- permet au service de compter les départs MESURABLES sans seconde requête.
          case when p.arrived_at is not null then (p.left_at - p.arrived_at) end as tenure_days
        from profiles p
        where p.role = 'chatteur' and p.left_at between p_from and p_to
      ) t
    ), '[]'::json)
  );
$$;

revoke execute on function public.turnover_report(date, date) from public, anon;
grant execute on function public.turnover_report(date, date) to authenticated;
