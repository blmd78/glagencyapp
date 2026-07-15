-- 0043 — Agrégation de l'onglet Santé EN BASE (même motif que 0020 chatters_report).
-- Avant : get-health tirait toutes les lignes brutes de creator_daily + chatter_creator_daily
-- sur la période (fetchAll) puis sommait en JS. Ici les GROUP BY sont faits en Postgres ;
-- le service reçoit quelques lignes déjà agrégées et ne fait plus que la présentation
-- (LTV, plan de rattrapage, KPIs, split inclus/exclus).
--
-- ⚠️ SECURITY INVOKER (pas DEFINER) : la RLS des tables de faits s'applique à l'appelant,
-- exactement comme les requêtes directes remplacées. Un manager `user` ne voit que ses
-- modèles (creator_daily / chatter_creator_daily scoped) ; le masquage restant est côté TS.
--
-- p_week_from = lundi de la semaine courante, calculé côté TS (mondayOf) et passé en
-- paramètre pour que la borne « semaine en cours » soit IDENTIQUE au code d'origine
-- (pas de dépendance au fuseau horaire de la base).

create or replace function public.health_report(p_from date, p_to date, p_week_from date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    -- Agrégat par modèle depuis creator_daily (RLS = ses modèles pour un `user`).
    -- week_* = sous-total de la semaine calendaire en cours ∩ période (borne p_week_from).
    'by_creator', coalesce((
      select json_agg(t) from (
        select
          creator_id,
          sum(ca)         as ca,
          sum(new_subs)   as new_subs,
          sum(renew_subs) as renew_subs,
          coalesce(sum(ca)       filter (where date >= p_week_from), 0) as week_ca,
          coalesce(sum(new_subs) filter (where date >= p_week_from), 0) as week_subs
        from creator_daily
        where date between p_from and p_to
        group by creator_id
      ) t
    ), '[]'::json),

    -- Ventilation par (modèle, chatteur) depuis chatter_creator_daily (RLS = ses modèles).
    'by_pair', coalesce((
      select json_agg(t) from (
        select creator_id, chatter_id, sum(ca) as ca
        from chatter_creator_daily
        where date between p_from and p_to
        group by creator_id, chatter_id
      ) t
    ), '[]'::json),

    -- Nb de jours distincts ingérés sur la période (KPI « X jour(s) ingérés »).
    'measured_days', coalesce((
      select count(distinct date) from creator_daily where date between p_from and p_to
    ), 0)
  );
$$;

grant execute on function public.health_report(date, date, date) to authenticated;
