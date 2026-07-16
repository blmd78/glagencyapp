-- 0035 — CA des spenders par jour (évolution), et retrait du CA « période » (la page
-- Spenders n'a plus de datepicker : on prend tout ce qu'on scrape). SECURITY INVOKER →
-- RLS appliquée (droit crm-spenders + cloisonnement modèle). Agrégation EN BASE.
drop function if exists public.crm_spenders_period_ca(date, date);

create or replace function public.crm_spenders_daily()
returns table (date date, ca numeric)
language sql stable security invoker set search_path = public
as $$
  select date, sum(net)::numeric as ca
  from fan_transactions
  where creator_id is not null
  group by date
  order by date
$$;
grant execute on function public.crm_spenders_daily() to authenticated;
