-- 0030 — CA par fan sur une période (somme de fan_transactions, bornes incluses).
-- SECURITY INVOKER : la RLS de fan_transactions s'applique (droit crm-spenders +
-- cloisonnement par modèle). Agrégation EN BASE (plafond CPU Workers Free).
create or replace function public.crm_spenders_period_ca(p_from date, p_to date)
returns table (creator_id uuid, fan_id bigint, ca numeric)
language sql stable security invoker set search_path = public
as $$
  select creator_id, fan_id, sum(net)::numeric as ca
  from fan_transactions
  where date between p_from and p_to and creator_id is not null
  group by 1, 2
$$;
grant execute on function public.crm_spenders_period_ca(date, date) to authenticated;
