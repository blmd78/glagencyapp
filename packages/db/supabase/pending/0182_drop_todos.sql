-- 0182 — Suppression de la to-do personnelle (décision Benoit, 2026-10-02).
--
-- La to-do de l'ancien « Planning / Todo » (`/chatter/planning?vue=todo`, tables 0067/0068/0069,
-- dates 0086, périmètre 0091) n'avait plus d'usage : dernière tâche créée le 2026-09-01, aucune
-- depuis. La to-do d'équipe vit dans Présence › To-Do (`tracker_todo_*`, 0127) : NON touchée.
-- Le code (`features/todos`) est retiré dans le même chantier ; les 95 tâches sont exportées
-- hors dépôt avant application (les sauvegardes Supabase Pro ne les gardent que 7 jours).
--
-- ORDRE D'APPLICATION :
--   1. APRÈS la mise en prod du code qui retire l'onglet — sinon l'onglet To-do de la version en
--      ligne lève sur une table absente ;
--   2. APRÈS 0180 (photos des modèles) et 0181 (type et modèle des événements Agence) — la séquence de
--      `schema_migrations` reste contiguë.
--
-- Rien d'autre ne dépend de ces objets (vérifié en prod le 2026-10-02 : aucune clé étrangère vers
-- `todos`, aucune vue, et les trois fonctions ne servent qu'aux policies de `todos`).

-- La table emporte ses policies (todos_select/insert/update/delete) et son trigger todos_touch_trg.
drop table if exists public.todos;

drop function if exists public.todos_touch();
drop function if exists public.can_write_todo_of(uuid);
drop function if exists public.writable_todo_targets();
