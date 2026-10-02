# Migrations en attente

Ce dossier n'est **pas lu** par `supabase db push` : on y range une migration écrite mais qui ne
doit pas encore partir. Le dossier `migrations/` est partagé par toutes les sessions, et un
`db push` y applique **tout** ce qui est en attente, sans option pour s'arrêter à une version.

Pour la publier : `git mv` du fichier vers `../migrations/` au moment de l'appliquer, en
respectant la séquence contiguë (`AGENTS.md` § Migrations).

| Fichier | Attend |
|---|---|
| `0182_drop_todos.sql` | la mise en prod du code qui retire l'onglet To-do, `0180` et `0181` appliquées, et l'export des tâches (fait le 2026-10-02 : `../glagencyapp-archives/todos-2026-10-02.json`, hors dépôt — refaire l'export si des tâches ont bougé depuis) |
