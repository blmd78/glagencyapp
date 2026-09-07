-- HABITUDES DÉPOSÉES : la hiérarchie peut poser un rituel chez un encadrant, pas seulement une
-- tâche du jour.
--
-- POURQUOI. La To-Do du tracker connaît deux dérogations à « le travail reste celui de son
-- titulaire » : DÉPOSER une tâche et RETIRER CE QU'ON A DÉPOSÉ (`todo-guards.ts`, reprises de
-- routes.js.txt:282-315). Les deux portent sur `tracker_todo_tasks`, c'est-à-dire sur UNE
-- occurrence, UN jour. Un manager qui veut qu'un sous-manager fasse la même chose chaque lundi n'a
-- donc qu'un geste : la reposer à la main, chaque semaine. Demande de Benoit, 2026-09-07 : « que je
-- puisse rajouter des habitudes à mon sous-manager, comme ça j'ai pas à le noter tout le temps ».
--
-- Le gabarit existe déjà (`tracker_todo_habits`, 0127) ; il ne lui manquait que la trace de QUI l'a
-- posé. Sans elle, on ne peut pas distinguer l'habitude que l'encadrant s'est donnée de celle qu'on
-- lui a déposée — et donc pas décider qui a le droit de l'éteindre.

alter table public.tracker_todo_habits
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

comment on column public.tracker_todo_habits.created_by is
  'Qui a DÉPOSÉ l''habitude. `null` = le titulaire lui-même — même convention que '
  'tracker_todo_tasks.created_by (0127), pour ne pas marquer d''un « déposée par » les habitudes '
  'qu''on se donne à soi-même. Une habitude déposée ne se supprime, ne se renomme et ne se met en '
  'pause QUE par son déposant (ou un admin) : son titulaire la subit et ne peut que sauter une '
  'occurrence, « juste aujourd''hui ». Décision de Benoit, 2026-09-07.';

-- PAS D'INDEX sur `created_by`, contrairement à `tracker_todo_tasks_created_by_idx` : aucune
-- requête ne cherche les habitudes PAR déposant. Elles se lisent toujours par titulaire
-- (`tracker_todo_habits_owner_idx`), quelques dizaines de lignes par personne, et `created_by`
-- n'est lu qu'une fois la ligne trouvée.

-- PAS DE POLITIQUE D'ÉCRITURE ajoutée — la table n'en a aucune depuis 0127, et c'est délibéré :
-- tout passe en service-role après garde dans les Server Actions (`assertCanEditHabit`). La règle
-- « qui peut toucher cette habitude » n'existe donc qu'à un seul endroit, en TypeScript pur
-- (`lib/tracking/habit-rules.ts`), et pas en double ici. La politique de LECTURE de 0127 suffit :
-- une habitude déposée se lit comme les autres, par tout porteur du droit `presence`.
