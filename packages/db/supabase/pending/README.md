# Migrations en attente

Ce dossier n'est **pas lu** par `supabase db push` : on y range une migration écrite mais qui ne
doit pas encore partir. Le dossier `migrations/` est partagé par toutes les sessions, et un
`db push` y applique **tout** ce qui est en attente, sans option pour s'arrêter à une version.

Pour la publier : `git mv` du fichier vers `../migrations/` au moment de l'appliquer, en
respectant la séquence contiguë (`AGENTS.md` § Migrations).

| Fichier | Attend |
|---|---|
| (aucun pour l'instant) | |
