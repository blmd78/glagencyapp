-- 0103 — Agrégation du TURNOVER en base (même motif que 0017/0049/0050/0051).
--
-- ⚠️ SECURITY INVOKER : la RLS de `profiles` s'applique à l'appelant. La page Membres est déjà
-- réservée aux encadrants (`requireAdminOrManager`) ; cette fonction n'ouvre donc rien de plus
-- que ce que l'appelant voit déjà, et ne peut pas devenir une fuite si elle était appelée
-- ailleurs.
--
-- BORNES EN PARAMÈTRES, jamais `current_date` en base : le serveur tourne en UTC et le jour
-- métier de l'agence est Europe/Paris (`todayParis()` côté TS). Même règle que tous les autres
-- rapports — c'est le piège de fuseau documenté dans guidelines-data-loading §1.
--
-- CE QUE LA FONCTION NE FAIT PAS : la moyenne d'ancienneté. Elle renvoie la SOMME des jours et
-- le NOMBRE de départs dont l'arrivée est connue, séparément. C'est délibéré : les départs sans
-- `arrived_at` (la majorité au démarrage) doivent être exclus du calcul, et l'écran doit pouvoir
-- afficher son dénominateur réel — « moyenne sur 7 départs sur 12 ». Une moyenne prémâchée en
-- SQL cacherait combien de départs elle ignore, et personne ne saurait qu'elle est partielle.

create or replace function public.turnover_report(p_from date, p_to date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with mois as (
    -- Les mois de la fenêtre, y compris ceux SANS mouvement : un mois absent de la série se
    -- lirait comme un trou du graphe, alors qu'il vaut zéro.
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
  ),
  par_mois as (
    select
      to_char(mois.m, 'YYYY-MM') as mois,
      (select count(*) from profiles p
        where p.arrived_at >= mois.m and p.arrived_at < mois.m + interval '1 month') as entrees,
      (select count(*) from profiles p
        where p.left_at >= mois.m and p.left_at < mois.m + interval '1 month') as sorties,
      -- Effectif à la FIN du mois : arrivé (ou créé) avant la fin, et pas encore parti.
      -- `coalesce(arrived_at, created_at::date)` : sans date d'arrivée saisie, la création du
      -- compte est le seul repère disponible pour ne pas sous-compter l'effectif courant.
      (select count(*) from profiles p
        where coalesce(p.arrived_at, p.created_at::date) < mois.m + interval '1 month'
          and (p.left_at is null or p.left_at >= mois.m + interval '1 month')) as effectif_fin
    from mois
  )
  select json_build_object(
    'by_month', coalesce((select json_agg(t order by t.mois) from par_mois t), '[]'::json),
    'by_reason', coalesce((
      select json_agg(t) from (
        select left_reason as reason, count(*) as n
        from profiles
        where left_at between p_from and p_to and left_reason is not null
        group by left_reason
      ) t
    ), '[]'::json),
    'tenure', (
      select json_build_object(
        -- Somme et compte SÉPARÉS, sur les seuls départs à l'arrivée connue (le `join` implicite
        -- par `arrived_at is not null` les filtre) — l'écran divise et affiche le dénominateur.
        'sum_days', coalesce(sum(left_at - arrived_at), 0),
        'known', count(*),
        -- Total des départs de la fenêtre, arrivée connue ou non : c'est le « sur 12 » de
        -- « moyenne sur 7 départs sur 12 ».
        'exits', (select count(*) from profiles where left_at between p_from and p_to)
      )
      from profiles
      where left_at between p_from and p_to and arrived_at is not null
    )
  );
$$;

revoke execute on function public.turnover_report(date, date) from public, anon;
grant execute on function public.turnover_report(date, date) to authenticated;
