-- 0139 — « Bouts de page » : le CA de l'AGENCE sur l'Overview, sans le détail par modèle.
--
-- LE BESOIN (Benoit, 2026-09-02) : pouvoir donner à un encadrant le CA global de l'agence sur
-- la période — qu'il ait des modèles assignés ou non, et SANS lui ouvrir le détail des modèles
-- qui ne lui sont pas assignés. Deux droits distincts, cochables séparément dans Membres :
-- `overview:ca` (le KPI de la période) et `overview:courbe` (la série quotidienne du graphe).
--
-- POURQUOI SECURITY DEFINER, alors que tout le reste de l'Overview est INVOKER (0052) : la RLS
-- filtre des LIGNES. `creator_daily_scoped_read` (0008) ne renvoie que les modèles assignés —
-- elle n'a aucun moyen de rendre un total sur des lignes qu'elle refuse de montrer. Assouplir
-- la policy donnerait le détail modèle par modèle, exactement ce qu'on ne veut pas. Même
-- arbitrage, et même motif, que `tracker_todo_week_recap` (0137) : compter sans laisser lire.
--
-- CE QUI SORT D'ICI : deux scalaires (un total, une série date→somme). AUCUN `creator_id`, à
-- aucun étage — il n'y a donc rien à ventiler, même en lisant la réponse réseau à la main.
--
-- LA GARDE EST PAR BOUT, pas par fonction : un appelant qui n'a que `overview:ca` reçoit
-- `daily: null`, et réciproquement. `has_page()` (0102) renvoie déjà vrai pour admin/superadmin
-- et faux pour un membre parti (`left_at`) — rien à rajouter.

create or replace function public.overview_ca_global(
  p_period_from date, p_period_to date,
  p_chart_from date, p_chart_to date
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    -- CA agence sur la PÉRIODE sélectionnée (datepicker du header). `case ... end` sans `else`
    -- → null quand le droit manque : le service garde alors sa valeur scopée par la RLS.
    'total', case when public.has_page('overview:ca') then (
      select coalesce(sum(ca), 0)
      from creator_daily
      where date between p_period_from and p_period_to
    ) end,

    -- Série quotidienne du CA agence sur le(s) MOIS entier(s) du graphe — même fenêtre que le
    -- `daily` de `overview_report` (0052), pour que les deux soient interchangeables côté TS.
    'daily', case when public.has_page('overview:courbe') then coalesce((
      select json_agg(t) from (
        select date, sum(ca) as ca
        from creator_daily
        where date between p_chart_from and p_chart_to
        group by date
        order by date
      ) t
    ), '[]'::json) end
  );
$$;

revoke all on function public.overview_ca_global(date, date, date, date) from public;
grant execute on function public.overview_ca_global(date, date, date, date) to authenticated;
