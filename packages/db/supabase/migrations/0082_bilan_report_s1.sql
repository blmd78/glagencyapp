-- 0082 — Bilan : part du CA réalisée PAR le script N°1 (complément du « hors S1 » de 0051).
-- `create or replace` du RPC bilan_report : ajoute s1_cur/s1_prev/s1_lm au bloc 'script'
-- (Σ revenue_day des lignes position = 1, par fenêtre). Champs ADDITIFS dans le JSON —
-- l'app déployée qui ignore ces clés continue de fonctionner à l'identique.
-- Le reste (by_creator, autres_*, mesure_*) est inchangé, recopié de 0051.

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
          coalesce(sum(revenue_day) filter (where date between p_start and p_end      and position = 1), 0)                as s1_cur,
          coalesce(bool_or(revenue_day is not null) filter (where date between p_start and p_end), false)                    as mesure_cur,
          coalesce(sum(revenue_day) filter (where date between p_prev_start and p_prev_end and position is distinct from 1), 0) as autres_prev,
          coalesce(sum(revenue_day) filter (where date between p_prev_start and p_prev_end and position = 1), 0)               as s1_prev,
          coalesce(bool_or(revenue_day is not null) filter (where date between p_prev_start and p_prev_end), false)          as mesure_prev,
          coalesce(sum(revenue_day) filter (where date between p_lm_start and p_lm_end and position is distinct from 1), 0)  as autres_lm,
          coalesce(sum(revenue_day) filter (where date between p_lm_start and p_lm_end and position = 1), 0)                 as s1_lm,
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
