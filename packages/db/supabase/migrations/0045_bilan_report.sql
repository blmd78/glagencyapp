-- 0045 — Agrégation du Bilan hebdo EN BASE (même motif que 0020/0043/0044). Avant :
-- get-bilan tirait toutes les lignes brutes de creator_daily + creator_script_daily sur
-- 5 semaines (fetchAll) puis bucketait en JS par fenêtre (cur/prev/lm). Ici les 3 fenêtres
-- sont sommées en Postgres via FILTER (elles sont DISJOINTES : cur=[start,end],
-- prev=[start-7,end-7], lm=[start-28,end-28] — end-7 < start, donc aucun chevauchement).
--
-- ⚠️ SECURITY INVOKER : la RLS s'applique à l'appelant (un `user` ne voit que ses modèles).
-- Le WHERE = UNION des 3 fenêtres → seuls les modèles ayant ≥1 ligne dans une fenêtre
-- apparaissent (identique au `ids` = union des clés de fenêtres côté TS).
--
-- « autres » = Σ revenue_day des scripts HORS N°1 (position ≠ 1, null compris via
-- `is distinct from 1`) ; « mesure » = au moins une valeur jour connue (revenue_day non-null),
-- toutes positions confondues. Aligné sur le reduce JS d'origine.

create or replace function public.bilan_report(
  p_start date, p_end date,
  p_prev_start date, p_prev_end date,
  p_lm_start date, p_lm_end date
)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'by_creator', coalesce((
      select json_agg(t) from (
        select
          creator_id,
          coalesce(sum(ca)       filter (where date between p_start and p_end), 0)           as ca_cur,
          coalesce(sum(new_subs) filter (where date between p_start and p_end), 0)           as ns_cur,
          coalesce(sum(ca)       filter (where date between p_prev_start and p_prev_end), 0) as ca_prev,
          coalesce(sum(new_subs) filter (where date between p_prev_start and p_prev_end), 0) as ns_prev,
          coalesce(sum(ca)       filter (where date between p_lm_start and p_lm_end), 0)     as ca_lm,
          coalesce(sum(new_subs) filter (where date between p_lm_start and p_lm_end), 0)     as ns_lm
        from creator_daily
        where date between p_start and p_end
           or date between p_prev_start and p_prev_end
           or date between p_lm_start and p_lm_end
        group by creator_id
      ) t
    ), '[]'::json),

    'script', coalesce((
      select json_agg(t) from (
        select
          creator_id,
          coalesce(sum(revenue_day) filter (where date between p_start and p_end      and position is distinct from 1), 0) as autres_cur,
          coalesce(bool_or(revenue_day is not null) filter (where date between p_start and p_end), false)                    as mesure_cur,
          coalesce(sum(revenue_day) filter (where date between p_prev_start and p_prev_end and position is distinct from 1), 0) as autres_prev,
          coalesce(bool_or(revenue_day is not null) filter (where date between p_prev_start and p_prev_end), false)          as mesure_prev,
          coalesce(sum(revenue_day) filter (where date between p_lm_start and p_lm_end and position is distinct from 1), 0)  as autres_lm,
          coalesce(bool_or(revenue_day is not null) filter (where date between p_lm_start and p_lm_end), false)              as mesure_lm
        from creator_script_daily
        where date between p_start and p_end
           or date between p_prev_start and p_prev_end
           or date between p_lm_start and p_lm_end
        group by creator_id
      ) t
    ), '[]'::json)
  );
$$;

grant execute on function public.bilan_report(date, date, date, date, date, date) to authenticated;
