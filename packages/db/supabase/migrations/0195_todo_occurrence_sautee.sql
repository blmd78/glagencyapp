-- 0195 — To-Do : « Juste aujourd'hui » retire vraiment l'occurrence d'une tâche récurrente (#170).
--
-- LE BUG (d'avant la série #160-#163) : `deleteTaskOccurrence` matérialisait l'occurrence puis
-- SUPPRIMAIT sa ligne. Rien ne restait en base ce jour-là ; or la grille ne cache une occurrence
-- que si une ligne existe (`isMaterialized`) : l'occurrence virtuelle revenait au rechargement, et
-- le Récap la comptait due. Le commentaire de l'action (« la ligne persistée devient la trace ») ne
-- correspondait pas au code.
--
-- LE CORRECTIF : la ligne RESTE, marquée `skipped`. Elle n'est plus affichée (grille, section, rang)
-- ni comptée (Récap : ni prévue, ni faite), mais continue de dire que l'habitude est matérialisée ce
-- jour-là — l'habitude ne renaît pas. Depuis 0193 une occurrence se reconnaît à (`habit_id`,
-- `habit_date`) : la ligne sautée la masque où qu'elle soit.
--
-- Aucune policy : les écritures `tracker_todo_*` passent en service-role après garde (0127).

alter table public.tracker_todo_tasks
  add column if not exists skipped boolean not null default false;

comment on column public.tracker_todo_tasks.skipped is
  'Occurrence d''habitude sautée (« Juste aujourd''hui », 0195) : ni affichée ni comptée, mais garde l''habitude matérialisée ce jour-là.';

-- Récap : corps repris de 0194, seules les lignes sautées sortent des comptes.
create or replace function public.tracker_todo_week_recap(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      select owner_id from tracker_todo_tasks where date between p_from and p_to and not skipped
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
      -- PRÉVUES = les tâches RÉELLES, plus les occurrences d'habitudes DUES que personne n'a
      -- encore touchées. Une habitude n'existe en base qu'au premier geste (cocher, déplacer) :
      -- s'en tenir aux lignes revenait à ne jamais compter une habitude OUBLIÉE, et à compter
      -- toute habitude cochée comme prévue ET faite. Le taux ne pouvait que monter (0160).
      -- 0195 — une occurrence SAUTÉE (« Juste aujourd'hui ») n'est plus prévue ce jour-là. Sa ligne
      -- reste, et continue de dire « déjà matérialisée » au bloc des habitudes dues ci-dessous.
      (select count(*) from tracker_todo_tasks t
        where t.owner_id = s.owner_id and t.date between p_from and p_to and not t.skipped)
      + (select count(*)
         from tracker_todo_habits h
         cross join generate_series(p_from, least(p_to, (now() at time zone 'Europe/Paris')::date),
                                    interval '1 day') as g(d)
         where h.owner_id = s.owner_id
           and h.active
           -- 0194 — pas avant sa date de début : une habitude posée aujourd'hui (import d'une
           -- to-do, #163) ne compte pas en « pas faite » sur les semaines passées. Nulle = sans
           -- borne, comme toutes les habitudes d'avant 0194.
           and (h.starts_on is null or g.d >= h.starts_on)
           -- Jour de la semaine listé dans l'habitude. Comparaison sur le TABLEAU découpé et non
           -- par `position()` : un `like '%1%'` attraperait aussi un futur « 10 ».
           and extract(isodow from g.d)::text = any(string_to_array(h.weekdays, ','))
           -- Un jour de repos n'attend rien de personne.
           and not exists (select 1 from tracker_todo_dayoff o
                            where o.owner_id = s.owner_id and o.date = g.d::date)
           -- Déjà matérialisée : c'est alors une ligne de `tracker_todo_tasks`, déjà comptée
           -- ci-dessus. 0193 — rapprochement par (`habit_id`, `habit_date`) d'abord : une
           -- occurrence RENOMMÉE ou CHANGÉE DE JOUR (pop-up de la To-Do) reste la sienne, le
           -- rapprochement par intitulé et jour la perdait et comptait l'habitude due une seconde
           -- fois. Repli sur (propriétaire, jour, intitulé) pour les lignes d'avant 0193.
           and not exists (select 1 from tracker_todo_tasks t2
                            where t2.owner_id = s.owner_id
                              and ((t2.habit_id = h.id and t2.habit_date = g.d::date)
                                   or (t2.habit_id is null and t2.date = g.d::date
                                       and t2.label = h.label)))
        ) as planned,
      (select count(*) from tracker_todo_tasks t
        where t.owner_id = s.owner_id and t.date between p_from and p_to and t.done and not t.skipped) as done,
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
$function$

;

comment on function public.tracker_todo_week_recap(date, date) is
  'Récap hebdo. Depuis 0160, `planned` inclut les occurrences d''habitudes DUES et non encore matérialisées (hors jours de repos, jusqu''à aujourd''hui). Depuis 0193, une occurrence se reconnaît à son habit_id et son habit_date (repli : jour et intitulé). Depuis 0194, une habitude n''est due qu''à partir de starts_on. Depuis 0195, une occurrence sautée n''est ni prévue ni faite.';
