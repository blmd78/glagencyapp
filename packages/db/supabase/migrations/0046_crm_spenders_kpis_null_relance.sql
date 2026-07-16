-- relance_today est NULL pour un spender jamais relancé (derniere_relance_jour = date
-- → NULL) : `not relance_today` l'excluait du compteur « à relancer » alors que côté
-- app `!grise` (null falsy) l'inclut. coalesce(…, false) aligne le SQL sur l'app.
create or replace function public.crm_spenders_kpis(p_seuil numeric default 40)
returns table(
  actifs integer,
  archives integer,
  ca_total numeric,
  a_relancer integer,
  alertes integer,
  orphelins integer
)
language sql
stable
set search_path to 'public'
as $$
  select
    count(*) filter (where not archived)::int,
    count(*) filter (where archived)::int,
    coalesce(sum(ca_total) filter (where not archived), 0),
    -- isARelancer : actif, pas relancé aujourd'hui, cycle en cours (R < 10 = R_ALERTE app)
    count(*) filter (where not archived and not coalesce(relance_today, false) and compteur_r < 10)::int,
    count(*) filter (where not archived and compteur_r >= 10)::int,
    count(*) filter (where not archived
      and (chatter_name is null or chatter_name = '')
      and (assigned_label is null or assigned_label = ''))::int
  from crm_spenders_tracker(p_seuil)
$$;
