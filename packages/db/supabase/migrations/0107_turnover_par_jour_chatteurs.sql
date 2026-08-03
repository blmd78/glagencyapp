-- 0107 — Le turnover se compte PAR JOUR et NE PORTE QUE SUR LES CHATTEURS.
--
-- ── 1. CHATTEURS SEULEMENT (demande Benoit 2026-08-03) ──────────────────────────────────────
-- 0103 comptait TOUS les profils : les 96 chatteurs, mais aussi les managers, sous-managers,
-- police et admins. Or le turnover qu'on veut mesurer est celui de la production — les encadrants
-- sont une poignée, ils bougent rarement, et les mélanger diluait le taux.
--
-- LE FILTRE EST APPLIQUÉ PARTOUT, pas seulement à l'effectif : entrées, sorties, motifs et
-- ancienneté. Un effectif de chatteurs rapporté à des sorties tous rôles confondus aurait produit
-- un taux qui ne veut rien dire — c'est le genre de chiffre faux qui se lit sans se remarquer.
--
-- CONSÉQUENCE ASSUMÉE : le départ d'un manager n'apparaît plus ici. `member_events` le garde, et
-- `profiles.role` reste intact (0102) — la mesure « tous rôles » reste donc reconstructible.
--
-- ── 2. PAR JOUR, ET TOUS LES JOURS ──────────────────────────────────────────────────────────
-- `generate_series` sur les JOURS de la période, pas sur les mois : un jour sans mouvement vaut
-- zéro et doit apparaître, sinon le graphe se resserre sur les seuls jours actifs et laisse croire
-- à une activité continue. Même grain que le graphe des abonnés (`subs_chart`), auquel celui-ci
-- s'aligne visuellement.
--
-- L'effectif quitte la série : le graphe ne porte plus que deux barres (entrées, sorties). Il
-- reste en KPI, calculé à l'instant présent — un effectif par jour aurait demandé une
-- sous-requête par jour pour une lecture que personne ne fait.

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
        where p.role = 'chatteur' and p.left_at = j.d) as sorties
    from jours j
  )
  select json_build_object(
    'by_day', coalesce((select json_agg(t order by t.jour) from par_jour t), '[]'::json),
    -- Effectif À CE JOUR et non à la fin d'un mois : c'est ce que le KPI annonce.
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
        -- Somme et compte SÉPARÉS, sur les seuls départs à l'arrivée connue : l'écran divise et
        -- affiche le dénominateur réel (« moyenne sur 7 départs sur 12 »). Une moyenne prémâchée
        -- cacherait combien de départs elle ignore.
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
