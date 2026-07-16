-- 0052 — Agrégation de l'Overview EN BASE (même motif que 0017/0049/0050/0051). Avant :
-- get-overview tirait toutes les lignes brutes de creator_daily (mois entier) +
-- chatter_daily/chatter_creator_daily (période) puis sommait en JS. Ici : 3 agrégats en
-- Postgres. Le service ne fait plus que la présentation (KPIs, parts %, série du graphe).
--
-- ⚠️ SECURITY INVOKER : la RLS s'applique à l'appelant. En mode restreint (`user`), le CA
-- chatteur vient de chatter_creator_daily (scopée à ses modèles) ; sinon de chatter_daily
-- (admin). Le `union all` a des gardes MUTUELLEMENT EXCLUSIVES sur p_restricted → une seule
-- branche renvoie des lignes. Le dénominateur « X/Y » reste calculé côté TS (hors RPC).

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
  select json_build_object(
    -- Par modèle sur la PÉRIODE (CA + nouveaux abonnés) — pour KPIs/parts/classements.
    'by_model', coalesce((
      select json_agg(t) from (
        select creator_id, sum(ca) as ca, sum(new_subs) as new_subs
        from creator_daily
        where date between p_period_from and p_period_to
        group by creator_id
      ) t
    ), '[]'::json),

    -- Série quotidienne sur le(s) MOIS entier(s) (CA total/jour, tous modèles) — pour le graphe.
    'daily', coalesce((
      select json_agg(t) from (
        select date, sum(ca) as ca
        from creator_daily
        where date between p_chart_from and p_chart_to
        group by date
      ) t
    ), '[]'::json),

    -- CA par chatteur sur la période — source selon le rôle (garde exclusive p_restricted).
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
    ), '[]'::json)
  );
$$;

grant execute on function public.overview_report(date, date, date, date, boolean) to authenticated;
