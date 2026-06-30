-- 0003_functions.sql — agrégations paramétrées par période.
-- SECURITY INVOKER (défaut) → la RLS de l'appelant s'applique (cloisonnement respecté).

-- Chatters agrégés sur [p_start, p_end]
create or replace function fn_chatters_period(p_start date, p_end date)
returns table (
  chatter_id uuid,
  name       text,
  creator_id uuid,
  team       text,
  ca         numeric,
  ca_ppv     numeric,
  ca_tips    numeric,
  propose    bigint,
  vendu      bigint,
  taux_conv  numeric
)
language sql stable as $$
  select c.id, c.name, c.creator_id, cr.name as team,
         coalesce(sum(d.ca), 0),
         coalesce(sum(d.ca_ppv), 0),
         coalesce(sum(d.ca_tips), 0),
         coalesce(sum(d.propose), 0),
         coalesce(sum(d.vendu), 0),
         case when coalesce(sum(d.propose), 0) > 0
              then round(100.0 * sum(d.vendu) / sum(d.propose), 2) end
  from chatters c
  left join creators cr on cr.id = c.creator_id
  left join chatter_daily d
         on d.chatter_id = c.id and d.date between p_start and p_end
  where c.active
  group by c.id, c.name, c.creator_id, cr.name;
$$;

-- Créateurs/modèles agrégés sur [p_start, p_end] (+ LTV)
create or replace function fn_creators_period(p_start date, p_end date)
returns table (
  creator_id  uuid,
  team        text,
  ca          numeric,
  subs_active numeric,
  new_subs    bigint,
  ltv         numeric
)
language sql stable as $$
  select cr.id, cr.name,
         coalesce(sum(d.ca), 0),
         coalesce(round(avg(nullif(d.subs_active, 0)), 1), 0),
         coalesce(sum(d.new_subs), 0),
         case when coalesce(sum(d.new_subs), 0) > 0
              then round(sum(d.ca) / sum(d.new_subs), 2) end
  from creators cr
  left join creator_daily d
         on d.creator_id = cr.id and d.date between p_start and p_end
  where not cr.excluded
  group by cr.id, cr.name;
$$;
