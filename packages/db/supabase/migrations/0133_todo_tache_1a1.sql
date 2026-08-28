-- La tâche « 1:1 avec un chatter » de la To-Do — le lien qui manquait entre la to-do et le suivi.
--
-- Règle du tracker d'origine, dont le commentaire dit tout : « Tâche 1:1 : pas de compte-rendu, pas
-- de coche. C'est la règle qui fait qu'un 1:1 réalisé laisse toujours une trace dans la fiche du
-- chatter » (routes.js.txt:328-329). Cocher une telle tâche n'est pas une case à cocher : ça ouvre
-- le bilan sur la fiche du chatteur, et l'enregistrement du bilan clôt la tâche en mémorisant la
-- session créée (`todo.setDone(task.id, true, sessionId)`, routes.js.txt:340).
--
-- Deux colonnes, toutes deux nullables : une tâche ordinaire n'en porte aucune.
alter table public.tracker_todo_tasks
  -- Le chatteur visé. `set null` : supprimer un profil ne doit pas effacer la tâche de l'encadrant,
  -- elle redevient simplement ordinaire (même parti pris que `created_by` juste au-dessus).
  add column if not exists chatter_id uuid references public.profiles(id) on delete set null,
  -- La session produite par la coche. Sa présence prouve que le 1:1 a laissé une trace.
  add column if not exists session_id uuid references public.tracker_sessions(id) on delete set null;

comment on column public.tracker_todo_tasks.chatter_id is
  'Chatteur visé par une tâche « 1:1 ». Non nul = la coche exige un compte-rendu et crée une session.';
comment on column public.tracker_todo_tasks.session_id is
  'Session 1:1 créée en cochant la tâche (tracker_sessions). Null tant que le bilan n''est pas rendu.';

-- Index de clé étrangère : sans eux, supprimer un profil ou une session scanne toute la table.
create index if not exists tracker_todo_tasks_chatter_idx on public.tracker_todo_tasks (chatter_id);
create index if not exists tracker_todo_tasks_session_idx on public.tracker_todo_tasks (session_id);
