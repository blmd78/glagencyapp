-- 0151 — Le Récap de la To-Do compte aussi la police.
--
-- Décision de Benoit, 2026-09-08 : « policier c'est comme manager, donc ils peuvent faire pareil
-- sur tous les sous-mana ». Côté app, le rôle `police` a désormais sa propre to-do et la
-- dérogation d'organisation sur TOUS les sous-managers (`lib/tracking/todo-roles.ts`,
-- `canOrganizeTodoOf`). Cette migration met le Récap au même diapason — sans quoi un policier
-- déposerait du travail chez un sous-manager sans jamais voir s'il est fait, ce qui est
-- exactement la moitié manquante de la feature.
--
-- Un seul objet touché : `tracker_todo_week_recap` (0137), recréée à l'identique à trois
-- endroits près, tous marqués « 0151 » ci-dessous. Les tables `tracker_todo_*` (0127) n'ont
-- toujours AUCUNE politique d'écriture (service-role après garde applicative) et la lecture est
-- déjà ouverte à tout porteur du droit `presence` : rien d'autre n'est à ouvrir pour la police.
--
-- POURQUOI PAS `can_manage_planning_of` : elle exige `caller.role = 'manager'` (0102:205-218) et
-- sert AUSSI au planning journalier, aux repos et à la to-do personnelle. L'élargir à la police
-- lui aurait donné, en silence, l'édition du planning journalier des sous-managers — ce qui n'a
-- pas été demandé. Le périmètre police vit donc ICI, en clair, à côté de celui du manager.

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
      s.uid,
      s.is_admin,
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
    -- LE VERBATIM, et lui seul, est conditionnel : admin, ou son propre journal. Un manager — et
    -- un policier — reçoit `[]` : l'écran affiche alors « Pas de débrief » jour par jour, ce qui
    -- serait un mensonge ; c'est `debriefs` (au-dessus, non filtré) qui porte l'information « il a
    -- débriefé N jours », et la feuille la lit pour ne pas déplier un détail qu'elle n'a pas.
    'days', case when a.is_admin or a.owner_id = a.uid then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', d.date,
          'focus', d.focus, 'problem', d.problem,
          'positive', d.positive, 'negative', d.negative, 'notes', d.notes
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
(`days`) n'est rendu qu'à un admin et à l'intéressé — le compte `debriefs`, lui, l'est à tout
lecteur autorisé. C'est la seule façon de compter des débriefs sans les lire ;
`tracker_todo_daily_read` (0132) reste fermée. Miroir SQL de `canOrganizeTodoOf`
(apps/web/src/lib/tracking/todo-roles.ts) : garder les deux alignés.$cmt$;
