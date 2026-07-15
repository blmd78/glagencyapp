-- 0044 — Agrégation de l'onglet Modèles EN BASE (même motif que 0020 chatters_report /
-- 0043 health_report). Avant : get-models tirait toutes les lignes brutes de creator_daily
-- + chatter_creator_daily sur la période (fetchAll) puis sommait en JS. Ici les GROUP BY
-- sont faits en Postgres ; le service ne fait plus que la présentation (LTV, conv, part %).
--
-- ⚠️ SECURITY INVOKER : la RLS des tables de faits s'applique à l'appelant, exactement
-- comme les requêtes directes remplacées (un manager `user` ne voit que ses modèles).

create or replace function public.models_report(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    -- Agrégat par modèle depuis creator_daily (colonnes CA/abonnés/renouvellements).
    'by_creator', coalesce((
      select json_agg(t) from (
        select
          creator_id,
          sum(ca)         as total,
          sum(ca_ppv)     as ppv,
          sum(ca_tips)    as tips,
          sum(ca_renew)   as renew,
          sum(new_subs)   as new_subs,
          sum(renew_subs) as renewals
        from creator_daily
        where date between p_from and p_to
        group by creator_id
      ) t
    ), '[]'::json),

    -- Ventilation par (modèle, chatteur) depuis chatter_creator_daily.
    'by_pair', coalesce((
      select json_agg(t) from (
        select
          creator_id,
          chatter_id,
          sum(ca)      as ca,
          sum(ca_ppv)  as ppv,
          sum(ca_tips) as tips,
          sum(propose) as propose,
          sum(vendu)   as vendu
        from chatter_creator_daily
        where date between p_from and p_to
        group by creator_id, chatter_id
      ) t
    ), '[]'::json)
  );
$$;

grant execute on function public.models_report(date, date) to authenticated;
