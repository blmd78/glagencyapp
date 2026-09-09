-- 0152 — Le CA des modèles, lisible par le pôle marketing.
--
-- La page /marketing/modeles met le CA venu des LIENS de tracking en rapport avec le CA TOTAL
-- de la modèle. Le premier est déjà lisible (mkt_* est ouvert à has_page('marketing')), le
-- second ne l'est pas : `creator_daily` et `creators` sont scopés « admin OU modèle assignée »
-- (0008:58 et 0008:64), et le pôle marketing n'a AUCUNE assignation dans profile_creators.
-- Résultat aujourd'hui : sur /marketing/liens, un non-admin voit tous les liens étiquetés
-- « Sans créatrice » — le nom lui est déjà refusé.
--
-- POURQUOI PAS un élargissement de policy : `creators_scoped_read` et `creator_daily_scoped_read`
-- portent le cloisonnement par modèle de TOUTE la face chatteurs. Y ajouter une disjonction
-- `has_page('mkt-modeles')` ouvrirait le CA ligne à ligne, partout, pour un besoin d'agrégat.
-- POURQUOI PAS une assignation profile_creators : elle marcherait, mais elle est implicite et
-- se défait au premier geste dans Membres.
--
-- Le périmètre exposé ici est un AGRÉGAT PAR MODÈLE SUR UNE PÉRIODE — jamais la ligne
-- journalière par modèle, jamais le détail par chatteur.
--
-- Comptes privés : regroupés sur leur modèle principale via `primary_creator_id`. Le trafic
-- traçable arrive sur le compte public ; le privé est un aval, l'en séparer fausserait la part.
-- `excluded` n'entre PAS en jeu : dans ce projet il ne sert qu'au calcul LTV de la page Santé
-- (features/models/services/get-models.ts:118).

create or replace function public.mkt_creator_revenue(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  -- Garde explicite : la fonction contourne la RLS, elle doit dire elle-même qui entre.
  if not (public.is_admin() or public.has_page('mkt-modeles')) then
    raise exception 'acces refuse' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── Par modèle, comptes privés regroupés.
    'creators', coalesce((
      select jsonb_agg(row_to_json(t) order by t.ca desc)
      from (
        select
          coalesce(c.primary_creator_id, c.id)   as creator_id,
          max(p.name)                            as name,
          round(sum(cd.ca), 2)                   as ca,
          sum(cd.new_subs)::bigint               as new_subs,
          -- STOCK, pas un flux : la valeur du DERNIER jour de la période, sommée sur les
          -- comptes regroupés. Une somme sur la période compterait chaque jour.
          coalesce(sum(cd.subs_active) filter (where cd.date = last.d), 0)::bigint as subs_active
        from creator_daily cd
        join creators c on c.id = cd.creator_id
        join creators p on p.id = coalesce(c.primary_creator_id, c.id)
        cross join lateral (
          select max(cd2.date) as d from creator_daily cd2
          where cd2.creator_id = cd.creator_id and cd2.date between p_from and p_to
        ) last
        where cd.date between p_from and p_to
        group by coalesce(c.primary_creator_id, c.id)
      ) t
    ), '[]'::jsonb),
    -- ── Nouveaux abonnés PAR JOUR, toute l'agence — dénominateur de la courbe de la page.
    -- Aucun regroupement à faire ici : on somme l'agence entière, comptes privés inclus.
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.date)
      from (
        select cd.date::text as date, sum(cd.new_subs)::bigint as new_subs
        from creator_daily cd
        where cd.date between p_from and p_to
        group by cd.date
      ) d
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.mkt_creator_revenue(date, date) from public;
grant execute on function public.mkt_creator_revenue(date, date) to authenticated;

comment on function public.mkt_creator_revenue(date, date) is
  'Agregat CA / nouveaux abonnes / abonnes actifs par modele sur une periode, comptes prives '
  'regroupes sur leur principale, plus la serie journaliere des nouveaux abonnes. security '
  'definer A DESSEIN : creator_daily et creators sont scopes par profile_creators et le pole '
  'marketing n''a aucune assignation. Garde interne : admin ou has_page(''mkt-modeles'').';
