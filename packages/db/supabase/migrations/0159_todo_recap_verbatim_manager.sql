-- 0159 — Le manager lit les débriefs de SES sous-managers dans le Récap.
--
-- Demande de Benoit, 2026-09-14 : « les managers doivent pouvoir voir les récap de leurs
-- sous-managers — quand ils cliquent, ça leur met que c'est réservé à la direction ». Jusqu'ici le
-- VERBATIM (`days`) n'était rendu qu'à un admin et à l'intéressé (0137, repris par 0151) : le
-- manager lisait les compteurs de ses sous-managers, jamais leur texte.
--
-- Un seul objet touché : `tracker_todo_week_recap`, recréée à l'identique de 0151 à trois endroits
-- près, tous marqués « 0159 » ci-dessous :
--   1. le verbatim s'ouvre au manager sur ses sous-managers RATTACHÉS — `can_manage_planning_of`
--      (0102), la même règle que ses compteurs. Elle exige `caller.role = 'manager'` : la POLICE,
--      qui voit les compteurs de tous les sous-managers (0151), ne lit toujours pas leur texte, et
--      un sous-manager ne lit toujours pas ses pairs (la raison de la fermeture de 0132) ;
--   2. la décision est RENDUE (`verbatim`) au lieu d'être recopiée dans l'app, qui l'écrivait une
--      seconde fois (`get-week-recap.ts`) et se serait tue pour le manager ;
--   3. chaque jour porte `updatedAt` : l'heure d'enregistrement du Récap (Release 2.49) était lue
--      à côté, par la policy `tracker_todo_daily_read` — fermée au manager, qui aurait vu le texte
--      sans l'heure.
-- `tracker_todo_daily_read` (0132) reste fermée : la lecture passe toujours par cette fonction.
--
-- Additive pour le code déjà en production : il ignore `verbatim` et `updatedAt` et garde sa propre
-- règle (admin ou soi) — la migration peut précéder le déploiement sans rien ouvrir de plus.

create or replace function public.tracker_todo_week_recap(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select (select auth.uid())                  as uid,
           (select public.is_admin())           as is_admin,
           (select public.has_page('presence')) as has_page,
           -- 0151 — le rôle police, lu une seule fois. `left_at is null` comme partout ailleurs :
           -- un membre parti n'a plus de périmètre (0102).
           exists (
             select 1 from profiles c
             where c.id = (select auth.uid()) and c.left_at is null and c.role = 'police'
           ) as is_police
  ),
  owners as (
    select distinct owner_id from (
      select owner_id from tracker_todo_tasks where date between p_from and p_to
      union
      select owner_id from tracker_todo_daily where date between p_from and p_to
      union
      -- CEUX DONT ON ATTEND UNE TO-DO, même sans une seule ligne cette semaine.
      --
      -- La liste ne dérivait que des lignes existantes : qui n'a RIEN fait disparaissait purement
      -- et simplement de l'écran, qui affichait « personne » là où la réponse est « 0/7 ». C'est
      -- précisément l'information qu'un écran de suivi doit donner : l'absence de travail est un
      -- résultat, pas une absence de ligne. Et elle ne pesait alors sur aucun total, puisque le
      -- dénominateur `totals.expected` est proportionnel au NOMBRE DE PERSONNES RENDUES
      -- (get-week-recap.ts) : un encadrant totalement inactif améliorait le ratio en disparaissant.
      --
      -- QUI, exactement :
      --   • soi-même, toujours ;
      --   • pour un admin : les porteurs du droit `presence` — c'est-à-dire les gens à qui on a
      --     confié une to-do. « Tous les encadrants » listerait dix-huit personnes dont la plupart
      --     n'ouvriront jamais l'outil ; le droit est la seule définition honnête de « attendu ».
      --     0151 : `police` entre dans cette liste de rôles, puisqu'un policier a désormais une
      --     to-do (miroir de `TODO_ROLES`, lib/tracking/todo-roles.ts).
      --   • pour un manager : ses sous-managers rattachés, PORTEURS DU DROIT eux aussi. Sans cette
      --     dernière condition il verrait une carte rouge « 0/7 débriefs » pour quelqu'un qui ne
      --     peut pas ouvrir l'écran — un reproche structurel, pas un constat de travail — et ce
      --     zéro pèserait dans le dénominateur `totals.expected`. Même critère que la branche
      --     admin. `p.role = 'sous-manager'` n'est pas une règle de plus, c'est un pré-filtre pour
      --     n'appeler `can_manage_planning_of` (qui refait un aller-retour sur profiles) que sur
      --     les lignes qui peuvent la satisfaire.
      --   • 0151, pour un POLICIER : les mêmes sous-managers, mais TOUS — il n'est rattaché à
      --     personne (`ATTACHABLE_ROLES.police` est vide depuis 0095, et Benoit a tranché « tous »
      --     plutôt que de rouvrir le rattachement pour trois comptes). Le `or` court-circuite donc
      --     l'appel de fonction pour lui.
      --
      -- Différence ASSUMÉE avec `scoped` ci-dessous, qui n'a pas de `left_at` : une personne PARTIE
      -- garde les lignes des semaines qu'elle a travaillées (les masquer réécrirait l'historique),
      -- mais n'est jamais AJOUTÉE à zéro sur les semaines suivantes.
      select p.id
      from profiles p, me
      where p.left_at is null
        -- SEMAINE COMMENCÉE seulement. Sur une semaine à venir, `expected` vaut 0 côté service et
        -- tout le monde ressortirait « 0/0 » badge rouge, pour du travail qui n'est pas encore dû —
        -- et l'admin, lui, lirait « Aucune to-do sur cette semaine ». La navigation de semaine n'a
        -- pas de borne haute : le cas est à un clic de « › ».
        and p_from <= (now() at time zone 'Europe/Paris')::date
        and (
          p.id = me.uid
          or (me.is_admin
              and p.role in ('superadmin', 'admin', 'manager', 'sous-manager', 'police')
              and 'presence' = any(p.pages))
          or (not me.is_admin and me.has_page
              and p.role = 'sous-manager' and 'presence' = any(p.pages)
              and (me.is_police or public.can_manage_planning_of(p.id)))
        )
    ) s
  ),
  scoped as (
    select o.owner_id, me.uid, me.is_admin
    from owners o, me
    where me.is_admin
       or o.owner_id = me.uid
       -- 0151 : la branche police est bornée au RÔLE de la personne regardée. Sans ce test, un
       -- policier lirait aussi les compteurs des managers et des admins — son périmètre s'arrête
       -- aux sous-managers, comme celui du manager s'arrête aux siens.
       or (me.has_page and (
             public.can_manage_planning_of(o.owner_id)
             or (me.is_police and exists (
                   select 1 from profiles t where t.id = o.owner_id and t.role = 'sous-manager'
                 ))
           ))
  ),
  agg as (
    select
      s.owner_id,
      -- 0159 — QUI LIT LE TEXTE : un admin, l'intéressé, et désormais le manager de ce
      -- sous-manager (`can_manage_planning_of` : rôle manager strict, sous-manager rattaché). Un
      -- policier ne passe aucune des trois branches — ses compteurs viennent de `scoped`, pas d'ici.
      (s.is_admin or s.owner_id = s.uid or public.can_manage_planning_of(s.owner_id)) as verbatim,
      (select count(*) from tracker_todo_tasks t
        where t.owner_id = s.owner_id and t.date between p_from and p_to) as planned,
      (select count(*) from tracker_todo_tasks t
        where t.owner_id = s.owner_id and t.date between p_from and p_to and t.done) as done,
      -- Un débrief COMPTE dès qu'un de ses cinq champs est rempli — une ligne toute vide est un
      -- passage sur l'écran, pas un débrief. Filtre repris tel quel de 0127:177-178.
      (select count(*) from tracker_todo_daily d
        where d.owner_id = s.owner_id and d.date between p_from and p_to
          and (btrim(d.focus) <> '' or btrim(d.problem) <> '' or btrim(d.positive) <> '' or btrim(d.negative) <> ''
               or btrim(d.notes) <> '')) as debriefs
    from scoped s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profileId', a.owner_id,
    'name', coalesce(pr.display_name, pr.email, 'sans nom'),
    'role', pr.role,
    'planned', a.planned,
    'done', a.done,
    'debriefs', a.debriefs,
    -- 0159 — la décision est RENDUE : l'app n'a plus à la recopier pour savoir si un `days` vide
    -- veut dire « rien de déposé » ou « pas pour toi ».
    'verbatim', a.verbatim,
    -- LE VERBATIM, et lui seul, est conditionnel. Un lecteur sans droit au texte — un policier —
    -- reçoit `[]` : l'écran affiche alors « Pas de débrief » jour par jour, ce qui serait un
    -- mensonge ; c'est `debriefs` (au-dessus, non filtré) qui porte l'information « il a débriefé
    -- N jours », et la feuille la lit pour ne pas déplier un détail qu'elle n'a pas.
    'days', case when a.verbatim then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', d.date,
          'focus', d.focus, 'problem', d.problem,
          'positive', d.positive, 'negative', d.negative, 'notes', d.notes,
          -- 0159 — l'heure du dernier enregistrement, pour « enregistré lundi 14/09 à 03:05 ».
          'updatedAt', d.updated_at
        ) order by d.date), '[]'::jsonb)
        from tracker_todo_daily d
        where d.owner_id = a.owner_id and d.date between p_from and p_to
      ) else '[]'::jsonb end
  ) order by a.done::numeric / greatest(a.planned, 1) desc, pr.display_name), '[]'::jsonb)
  from agg a
  join profiles pr on pr.id = a.owner_id
$$;

-- `create or replace` conserve l'ACL, mais on la réémet : une fonction definer dont `public`
-- garderait l'exécution est le pire des deux mondes.
revoke all on function public.tracker_todo_week_recap(date, date) from public;
grant execute on function public.tracker_todo_week_recap(date, date) to authenticated;

comment on function public.tracker_todo_week_recap(date, date) is
  $cmt$Récap hebdomadaire des to-do. SECURITY DEFINER À DESSEIN : le périmètre est écrit dans la
fonction (admin → tout ; soi → toujours ; manager → ses sous-managers rattachés,
`can_manage_planning_of` ; police → TOUS les sous-managers, 0151). Le VERBATIM des débriefs
(`days`, avec `updatedAt`) est rendu à un admin, à l'intéressé et, depuis 0159, au manager de ses
sous-managers rattachés — la décision est renvoyée dans `verbatim`. Le compte `debriefs`, lui, l'est
à tout lecteur autorisé. C'est la seule façon de compter des débriefs sans les lire ;
`tracker_todo_daily_read` (0132) reste fermée. Miroir SQL de `canOrganizeTodoOf`
(apps/web/src/lib/tracking/todo-roles.ts) : garder les deux alignés.$cmt$;
