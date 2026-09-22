-- 0165 — Le CA Uncove s'arrête là où commence le relevé MyPuls (demande Benoit 2026-09-22).
--
-- `uncove_daily` remonte au 18/08/2025 (l'API Uncove rend 400 jours en une requête) alors que
-- `creator_daily` ne commence qu'au 01/06/2026 : sans borne, toute période antérieure à juin
-- affichait un CA composé à 100 % d'Uncove — 94 563 € sur 9 mois où MyPuls ne dit rien. Un
-- « CA total » d'octobre 2025 à 12 000 € est plus trompeur qu'utile : il se lit comme le CA de
-- l'agence alors qu'il ne décrit qu'une plateforme.
--
-- La borne est DYNAMIQUE (`min(date)` de `creator_daily`) et non une date en dur : le jour où
-- l'historique MyPuls sera repris plus loin, le CA Uncove correspondant s'ouvrira tout seul.
-- Elle s'applique aux TROIS branches Uncove (`by_model`, `daily`, `totals`) — les borner
-- séparément ferait mentir la courbe par rapport à ses propres cartes.
--
-- `min(date)` est évalué une fois (sous-requête scalaire non corrélée, InitPlan) et lit un
-- index : coût négligeable. Sous RLS `creator_daily_scoped_read`, c'est le min VISIBLE par
-- l'appelant — sans effet ici, la branche Uncove étant réservée à l'admin (`not p_restricted`),
-- qui voit toutes les lignes.

create or replace function public.overview_report(
  p_period_from date, p_period_to date,
  p_chart_from date, p_chart_to date,
  p_restricted boolean
)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with mypuls_start as (select min(date) as day from creator_daily)
  select json_build_object(
    -- Par modèle sur la PÉRIODE (CA + nouveaux abonnés) — pour KPIs/parts/classements.
    'by_model', coalesce((
      select json_agg(t) from (
        select creator_id, sum(ca) as ca, sum(new_subs) as new_subs
        from (
          select creator_id, ca, new_subs
          from creator_daily
          where date between p_period_from and p_period_to
          union all
          select a.creator_id, d.revenue, 0
          from uncove_daily d
          join uncove_accounts a on a.id = d.account_id
          where not p_restricted and a.counts_in_ca and a.creator_id is not null
            and d.day between p_period_from and p_period_to
            and d.day >= (select day from mypuls_start)
        ) s
        group by creator_id
      ) t
    ), '[]'::json),

    -- Série quotidienne sur le(s) MOIS entier(s) (CA total/jour, tous modèles) — pour le graphe.
    'daily', coalesce((
      select json_agg(t) from (
        select date, sum(ca) as ca
        from (
          select date, ca
          from creator_daily
          where date between p_chart_from and p_chart_to
          union all
          select d.day, d.revenue
          from uncove_daily d
          join uncove_accounts a on a.id = d.account_id
          where not p_restricted and a.counts_in_ca
            and d.day between p_chart_from and p_chart_to
            and d.day >= (select day from mypuls_start)
        ) s
        group by date
      ) t
    ), '[]'::json),

    -- CA par chatteur sur la période — source selon le rôle (garde exclusive p_restricted).
    -- Uncove n'y entre PAS : ce CA n'est le travail d'aucun chatteur.
    'by_chatter', coalesce((
      select json_agg(t) from (
        select chatter_id, sum(ca) as ca
        from chatter_creator_daily
        where p_restricted and date between p_period_from and p_period_to
        group by chatter_id
        union all
        select chatter_id, sum(ca) as ca
        from chatter_daily
        where (not p_restricted) and date between p_period_from and p_period_to
        group by chatter_id
      ) t
    ), '[]'::json),

    -- Totaux de la période par SOURCE (cartes « CA MyPuls » / « CA Uncove »). `uncove` reste
    -- `null` quand il n'y a rien à compter — y compris, depuis cette migration, sur une période
    -- entièrement antérieure au relevé MyPuls : les deux cartes de détail disparaissent alors,
    -- et l'Overview affiche le seul CA MyPuls (0 €), comme avant Uncove.
    'totals', json_build_object(
      'mypuls', (
        select sum(ca) from creator_daily
        where date between p_period_from and p_period_to
      ),
      'uncove', (
        select sum(d.revenue)
        from uncove_daily d
        join uncove_accounts a on a.id = d.account_id
        where not p_restricted and a.counts_in_ca
          and d.day between p_period_from and p_period_to
          and d.day >= (select day from mypuls_start)
      )
    )
  );
$$;

grant execute on function public.overview_report(date, date, date, date, boolean) to authenticated;
