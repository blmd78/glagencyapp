-- Agrégats KPI spenders, calculés EN BASE sur le même jeu que le tracker : la fonction
-- s'appuie sur crm_spenders_tracker (aucune duplication de logique, même RLS — SECURITY
-- INVOKER par transitivité). Nécessaire depuis le chargement en deux temps : le client ne
-- reçoit d'abord que la 1ʳᵉ page, les KPI doivent être exacts dès le premier écran.
-- Le seuil d'alerte 10 = R_ALERTE côté app (features/spenders/types.ts).
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
    -- isARelancer : actif, pas relancé aujourd'hui, cycle en cours (R < 10)
    count(*) filter (where not archived and not relance_today and compteur_r < 10)::int,
    count(*) filter (where not archived and compteur_r >= 10)::int,
    count(*) filter (where not archived
      and (chatter_name is null or chatter_name = '')
      and (assigned_label is null or assigned_label = ''))::int
  from crm_spenders_tracker(p_seuil)
$$;
