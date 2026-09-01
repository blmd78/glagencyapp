-- 0137 — La To-Do du tracker s'ouvre à l'encadrement : le manager suit ses sous-managers.
--
-- Trois gestes, dans cet ordre de risque décroissant :
--   1. le Récap sort de l'admin-only, mais en CHIFFRES SEULS hors de son propre débrief ;
--   2. le bloc-notes de la semaine se referme comme le débrief l'a été en 0132 ;
--   3. le produit cartésien de `tracker_todo_week_recap` est corrigé (bug préexistant).
--
-- Rappel du contexte, indispensable pour relire ce fichier : les tables `tracker_todo_*` (0127)
-- n'ont AUCUNE politique d'écriture — tout passe par le service-role après garde dans les Server
-- Actions. Cette migration ne touche donc que la LECTURE et la fonction d'agrégat.

-- ---------------------------------------------------------------------------- 1. bloc-notes
--
-- `tracker_todo_notes.body` est un bloc-notes LIBRE de la semaine : même nature que les cinq
-- champs du débrief, dont 0132 disait « c'est un journal personnel ». 0127:148-149 l'avait
-- pourtant laissé lisible par tout porteur du slug `presence` — l'incohérence n'avait aucune
-- conséquence tant que PERSONNE ne portait ce droit (0 profil en prod au 2026-08-31). Elle en
-- prend une le jour où on le distribue aux sous-managers : chacun lirait, en direct via PostgREST
-- et sans passer par aucun écran, les notes de semaine de ses pairs et de ses managers.
--
-- Conséquence assumée : ouvrir la semaine de quelqu'un d'autre (dérogation de dépôt, §3) montre
-- ses tâches mais PLUS son bloc-notes. C'est voulu — déposer une tâche n'est pas lire un journal.
drop policy if exists tracker_todo_notes_read on public.tracker_todo_notes;

create policy tracker_todo_notes_read on public.tracker_todo_notes for select to authenticated
  using ((select public.is_admin()) or owner_id = (select auth.uid()));

comment on table public.tracker_todo_notes is
  $cmt$Bloc-notes libre de la semaine d'un encadrant. Lecture : son auteur et les admins seuls —
même régime que `tracker_todo_daily` (0132), même raison : c'est un journal personnel.$cmt$;

-- ---------------------------------------------------------------------------- 2. récap
--
-- La fonction passe en SECURITY DEFINER. C'est une ENTORSE ASSUMÉE à la convention
-- « RPC = security invoker » (docs/guidelines-data-loading.md), et elle est la seule façon de
-- tenir la règle voulue : « le manager voit les COMPTEURS de ses sous-managers, jamais le texte
-- de leurs débriefs ».
--
-- Pourquoi invoker ne peut pas marcher, dans les deux sens :
--   • en gardant 0132 tel quel, le join sur `tracker_todo_daily` ne renvoie rien au manager :
--     il lirait « 0/7 débriefs » pour tout le monde — un faux négatif MUET (la RLS filtre, elle
--     ne lève pas), qu'on relirait comme « personne ne débriefe » ;
--   • en rouvrant 0132 au manager pour rétablir le compte, il lit le verbatim en direct par
--     PostgREST ; le masquer côté écran ne serait qu'optimiste, ce que ce dépôt refuse
--     (« RLS = enforcement réel », CLAUDE.md).
-- Le compte des débriefs et leur contenu ne sont séparables QUE dans une fonction qui voit les
-- deux et ne rend que le premier. D'où le definer, et d'où le périmètre écrit ici, en clair.
--
-- PÉRIMÈTRE (le `where` de `scoped`) — c'est la seule autorisation de la fonction, elle remplace
-- la RLS que le definer met en sommeil :
--   • admin/superadmin : tout le monde, verbatim compris (usage historique de l'écran) ;
--   • soi-même : toujours, verbatim compris (c'est son propre journal) ;
--   • manager PORTEUR DU DROIT `presence` : ses sous-managers RATTACHÉS (`can_manage_planning_of`,
--     dernière définition en 0102:205-218 — rôle `manager` strict + `manager_ids @> array[caller]`), en CHIFFRES SEULS.
--     Le `has_page` n'est pas décoratif : la fonction est `grant execute to authenticated`, donc
--     appelable en direct par PostgREST. Sans lui, un manager à qui personne n'a coché « Présence »
--     lirait quand même les compteurs de ses sous-managers en contournant l'écran.
-- Un sous-manager n'a personne sous lui : la fonction lui rend sa seule ligne. C'est voulu —
-- l'écran devient « mon récap de la semaine » plutôt qu'une page interdite.
--
-- CORRECTIF DE COMPTAGE (bug préexistant). L'ancien corps joignait `tracker_todo_tasks` ET
-- `tracker_todo_daily` sur le même `owner_id` avant d'agréger : le produit cartésien multipliait
-- `planned` et `done` par le nombre de jours de débrief visibles. 3 tâches + 2 débriefs
-- affichaient « 6 prévues / 4 faites ». Le bug était invisible (table vide en prod, un seul
-- lecteur), mais il serait devenu VISIBLE et surtout INCOHÉRENT ENTRE LECTEURS : le facteur
-- dépend du nombre de débriefs qu'on a le droit de lire. Sous-requêtes scalaires — chacune est
-- close sur son propriétaire, aucune ne peut plus en gonfler une autre.
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
           (select public.has_page('presence')) as has_page
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
      --   • pour un manager : ses sous-managers rattachés, PORTEURS DU DROIT eux aussi. Sans cette
      --     dernière condition il verrait une carte rouge « 0/7 débriefs » pour quelqu'un qui ne
      --     peut pas ouvrir l'écran — un reproche structurel, pas un constat de travail — et ce
      --     zéro pèserait dans le dénominateur `totals.expected`. Même critère que la branche
      --     admin. `p.role = 'sous-manager'` n'est pas une règle de plus, c'est un pré-filtre pour
      --     n'appeler `can_manage_planning_of` (qui refait un aller-retour sur profiles) que sur
      --     les lignes qui peuvent la satisfaire.
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
              and p.role in ('superadmin', 'admin', 'manager', 'sous-manager')
              and 'presence' = any(p.pages))
          or (not me.is_admin and me.has_page
              and p.role = 'sous-manager' and 'presence' = any(p.pages)
              and public.can_manage_planning_of(p.id))
        )
    ) s
  ),
  scoped as (
    select o.owner_id, me.uid, me.is_admin
    from owners o, me
    where me.is_admin
       or o.owner_id = me.uid
       or (me.has_page and public.can_manage_planning_of(o.owner_id))
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
    -- LE VERBATIM, et lui seul, est conditionnel : admin, ou son propre journal. Un manager
    -- reçoit `[]` — l'écran affiche alors « Pas de débrief » jour par jour, ce qui serait un
    -- mensonge : c'est `debriefs` (au-dessus, non filtré) qui porte l'information « il a
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

-- Le passage en definer réémet les droits explicitement : `create or replace` conserve l'ACL,
-- mais une fonction definer dont `public` garderait l'exécution est le pire des deux mondes.
revoke all on function public.tracker_todo_week_recap(date, date) from public;
grant execute on function public.tracker_todo_week_recap(date, date) to authenticated;

comment on function public.tracker_todo_week_recap(date, date) is
  $cmt$Récap hebdomadaire des to-do des encadrants. SECURITY DEFINER À DESSEIN : le périmètre est
écrit dans la fonction (admin → tout ; soi → toujours ; manager → ses sous-managers rattachés,
`can_manage_planning_of`). Le VERBATIM des débriefs (`days`) n'est rendu qu'à un admin et à
l'intéressé — le compte `debriefs`, lui, l'est à tout lecteur autorisé. C'est la seule façon de
compter des débriefs sans les lire ; `tracker_todo_daily_read` (0132) reste fermée.$cmt$;
