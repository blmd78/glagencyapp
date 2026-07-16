-- 0017 — Agrégation de l'onglet Chatteurs EN BASE (fix Cloudflare Worker « Error 1102
-- exceeded resources »). Avant : le worker tirait toutes les lignes brutes de
-- chatter_daily / chatter_creator_daily / creator_daily sur la période (~7,5k lignes sur
-- 5 semaines) puis sommait en JS. Sur le plan Workers Free (plafond CPU 10 ms/requête),
-- ce parsing + reduce dépassait le budget dès que la plage s'élargissait → 1102.
-- Ici : les GROUP BY sont faits en Postgres ; le worker reçoit ~quelques centaines de
-- lignes déjà sommées et ne fait plus que la présentation (com, conv, tri).
--
-- ⚠️ SECURITY INVOKER (pas DEFINER) : la RLS des tables de faits doit s'appliquer à
-- l'appelant. Un manager `user` ne voit que ses modèles via chatter_creator_daily
-- (policy scoped) ; chatter_daily / teams restent admin-only → renvoient vide pour lui,
-- exactement comme les requêtes directes qu'on remplace. Le masquage `restricted → null`
-- (com, proposé, présence, réactivité, scope, ranking) reste côté TS.

create or replace function public.chatters_report(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    -- En-tête chatteur (non restreint) : agrégat tous-modèles depuis chatter_daily.
    -- Vide pour un `user` (RLS admin-only) → le TS reconstruit l'agrégat depuis by_creator.
    'totals', coalesce((
      select json_agg(t) from (
        select
          chatter_id,
          sum(ca)                as ca,
          sum(ca_ppv)            as ppv,
          sum(ca_tips)           as tips,
          sum(propose)           as propose,
          sum(vendu)             as vendu,
          sum(presence_active_h) as presence_active_h,
          sum(presence_idle_h)   as presence_idle_h,
          avg(reactivite_sec)    as reactivite_avg
        from chatter_daily
        where date between p_from and p_to
        group by chatter_id
      ) t
    ), '[]'::json),

    -- Ventilation par (chatteur, modèle) depuis chatter_creator_daily (RLS = ses modèles).
    'by_creator', coalesce((
      select json_agg(t) from (
        select
          ccd.chatter_id,
          ccd.creator_id,
          c.name        as model,
          sum(ccd.ca)       as ca,
          sum(ccd.ca_ppv)   as ppv,
          sum(ccd.ca_tips)  as tips,
          sum(ccd.propose)  as propose,
          sum(ccd.vendu)    as vendu
        from chatter_creator_daily ccd
        left join creators c on c.id = ccd.creator_id
        where ccd.date between p_from and p_to
        group by ccd.chatter_id, ccd.creator_id, c.name
      ) t
    ), '[]'::json),

    -- Libellés chatteurs (+ équipe). teams est admin-only → team null pour un `user`.
    'chatters', coalesce((
      select json_agg(t) from (
        select
          ch.id,
          ch.display_name,
          ch.email::text as email,
          ch.active,
          tm.name        as team
        from chatters ch
        left join teams tm on tm.id = ch.team_id
      ) t
    ), '[]'::json),

    -- Périmètres emboîtés du CA (le TS les met à null en mode restreint).
    'scope', json_build_object(
      'attributed',   coalesce((select sum(ca)             from chatter_daily where date between p_from and p_to), 0),
      'messaging',    coalesce((select sum(ca_ppv+ca_tips) from creator_daily where date between p_from and p_to), 0),
      'all_accounts', coalesce((select sum(ca)             from creator_daily where date between p_from and p_to), 0)
    ),

    -- Classement du dernier jour ingéré : noms triés par CA du jour (top 15, ca>0).
    -- null quand chatter_daily est vide sur la période (dont mode restreint).
    'ranking', (
      select case when mx.d is null then null else json_build_object(
        'date', mx.d,
        'names', coalesce((
          select json_agg(x.display_name)
          from (
            select ch.display_name, cd.ca
            from chatter_daily cd
            join chatters ch on ch.id = cd.chatter_id
            where cd.date = mx.d
              and coalesce(cd.ca, 0) > 0
              and ch.display_name is not null
            order by cd.ca desc
            limit 15
          ) x
        ), '[]'::json)
      ) end
      from (select max(date) as d from chatter_daily where date between p_from and p_to) mx
    )
  );
$$;

grant execute on function public.chatters_report(date, date) to authenticated;
