-- 0164 — Le CA Uncove entre dans l'Overview (demande Benoit 2026-09-22).
--
-- Uncove (0163) est une plateforme que MyPuls NE RELÈVE PAS : son CA manquait purement et
-- simplement au CA de l'agence. On l'y ajoute, avec deux garde-fous.
--
-- 1) `counts_in_ca` — « CA hors MyPuls ». Vrai par défaut (c'est le cas aujourd'hui pour les 4
--    comptes) ; décocher rend un compte purement informatif. C'est l'interrupteur qui évite le
--    DOUBLE COMPTAGE le jour où MyPuls relèvera Uncove : sans lui, il faudrait une migration.
-- 2) `creator_id` — la modèle CRM, posée à la MAIN dans /chatter/uncove/modeles. Aucun
--    rattachement automatique par nom : « Carla » existe en 3 exemplaires côté `creators`
--    (Carla, Carla (OnlyFans), Carla (privé)) et se tromper de ligne fausse un classement.
--    Null est LÉGITIME et assumé : le CA compte alors dans le total de l'agence SANS ligne au
--    classement par modèle (décision Benoit : « si pas rattaché on les assigne pas, juste les
--    chiffres remontent dans le CA global »). Conséquence acceptée : la somme des lignes du
--    classement peut être < CA total, l'écart étant exactement l'Uncove non rattaché.
--
-- Périmètre : ADMIN UNIQUEMENT (`not p_restricted`, miroir de `profile.role !== 'admin'` côté
-- page). Un encadrant garde un CA 100 % MyPuls. La RLS `uncove_daily_read` (0163 : admin ou
-- porteur de la page « uncove ») reste le vrai garde-fou — la RPC est `security invoker`.
--
-- NON touché volontairement : la Compta et le CA par chatteur (commissions) restent 100 %
-- MyPuls — personne ne chatte sur Uncove, ce CA n'appartient à aucun chatteur. Et le classement
-- « nouveaux abonnés » reste MyPuls (la branche Uncove rend `new_subs = 0`).
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : cette migration change ce que rend `overview_report`. L'appliquer en
-- PROD avant que le code de la release n'y soit gonflerait le KPI « CA total » sans afficher les
-- cartes qui l'expliquent → l'appliquer en prod AU MOMENT du déploiement, pas avant (même
-- précaution que 0157).

alter table public.uncove_accounts
  add column if not exists creator_id   uuid references public.creators(id) on delete set null,
  add column if not exists counts_in_ca boolean not null default true;

comment on column public.uncove_accounts.creator_id is
  'Modèle CRM rattachée, posée à la main. Null = le CA compte dans le total agence mais n''apparaît sur aucune ligne du classement par modèle.';
comment on column public.uncove_accounts.counts_in_ca is
  '« CA hors MyPuls » : true = ce CA n''est pas relevé par MyPuls, il s''ajoute au CA de l''agence (Overview, admin). False = compte informatif, section Uncove seulement.';

-- ── `overview_report` : MyPuls + Uncove ──────────────────────────────────────
-- Remplace 0052 (mêmes arguments, même `security invoker`). Trois changements :
--   · `by_model` : + le CA Uncove des comptes RATTACHÉS (la ventilation a besoin d'un modèle).
--   · `daily`    : + le CA Uncove de TOUS les comptes comptabilisés (la courbe suit le total).
--   · `totals`   : NOUVEAU — `{mypuls, uncove}` sur la période, pour les 3 cartes CA de
--     l'Overview. `uncove` vaut `null` (et non 0) quand il n'y a aucune ligne à compter — donc
--     hors admin, ou sans compte comptabilisé : la page s'en sert pour n'afficher les cartes
--     « CA MyPuls » / « CA Uncove » que lorsqu'elles ont un sens. Un compte relevé dont le CA
--     est nul rend bien `0`, lui : `uncove_daily` a une ligne par jour, même à 0 €.
create or replace function public.overview_report(
  p_period_from date, p_period_to date,
  p_chart_from date, p_chart_to date,
  p_restricted boolean
)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    -- Par modèle sur la PÉRIODE (CA + nouveaux abonnés) — pour KPIs/parts/classements.
    'by_model', coalesce((
      select json_agg(t) from (
        select creator_id, sum(ca) as ca, sum(new_subs) as new_subs
        from (
          select creator_id, ca, new_subs
          from creator_daily
          where date between p_period_from and p_period_to
          union all
          select a.creator_id, d.revenue, 0
          from uncove_daily d
          join uncove_accounts a on a.id = d.account_id
          where not p_restricted and a.counts_in_ca and a.creator_id is not null
            and d.day between p_period_from and p_period_to
        ) s
        group by creator_id
      ) t
    ), '[]'::json),

    -- Série quotidienne sur le(s) MOIS entier(s) (CA total/jour, tous modèles) — pour le graphe.
    'daily', coalesce((
      select json_agg(t) from (
        select date, sum(ca) as ca
        from (
          select date, ca
          from creator_daily
          where date between p_chart_from and p_chart_to
          union all
          select d.day, d.revenue
          from uncove_daily d
          join uncove_accounts a on a.id = d.account_id
          where not p_restricted and a.counts_in_ca
            and d.day between p_chart_from and p_chart_to
        ) s
        group by date
      ) t
    ), '[]'::json),

    -- CA par chatteur sur la période — source selon le rôle (garde exclusive p_restricted).
    -- Uncove n'y entre PAS : ce CA n'est le travail d'aucun chatteur (cf. en-tête).
    'by_chatter', coalesce((
      select json_agg(t) from (
        select chatter_id, sum(ca) as ca
        from chatter_creator_daily
        where p_restricted and date between p_period_from and p_period_to
        group by chatter_id
        union all
        select chatter_id, sum(ca) as ca
        from chatter_daily
        where (not p_restricted) and date between p_period_from and p_period_to
        group by chatter_id
      ) t
    ), '[]'::json),

    -- Totaux de la période par SOURCE (cartes « CA MyPuls » / « CA Uncove »).
    'totals', json_build_object(
      'mypuls', (
        select sum(ca) from creator_daily
        where date between p_period_from and p_period_to
      ),
      'uncove', (
        select sum(d.revenue)
        from uncove_daily d
        join uncove_accounts a on a.id = d.account_id
        where not p_restricted and a.counts_in_ca
          and d.day between p_period_from and p_period_to
      )
    )
  );
$$;

grant execute on function public.overview_report(date, date, date, date, boolean) to authenticated;
