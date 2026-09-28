# Git workflow & releases — glagencyapp

Process **manuel, sans CI** (décision Benoit, cf. commit `847dc3c` : pas de GitHub
Actions ; les vérifications restent **locales par task**). Objectif : simple mais fiable.
C'est **Claude qui exécute les commits/PR/tags** sur demande — ce doc est la règle qu'il applique.

## Branches & rôles

| Branche | Rôle | Vercel |
|---|---|---|
| `main` | état **livré en prod**. Protégée (ruleset) : **jamais de push direct**, PR + merge only. | → **Production** (DB prod `cqmfpsnqaxymswijdnfz`) |
| `develop` | intégration continue. Tout converge ici avant de sortir. | → **Preview / préprod** (DB **UAT** `ihkksdmgtrbbjugeboks`) |
| `feature/*` | une feature, **partie de `develop`**, PR **vers `develop`**. | Preview par commit |
| `hotfix/*` | correctif urgent prod, **partie de `main`**, PR **vers `main`**. | — |

**La préprod (UAT) est la porte de release** : rien ne part en prod qui n'ait été vu vert sur la préprod.

## Cycle normal (feature → prod)

1. `git switch develop && git pull` puis `git switch -c feature/x`.
2. Travail → **vérifs locales** (lint · typecheck · build · tests `@glagency/core`) → PR `feature/x` → `develop`.
3. Merge dans `develop` → déploie **tout seul sur la préprod (UAT)**. On teste là.
4. Quand `develop` est vert et prêt à sortir : `pnpm release:prepare` sur `develop`, push de `develop`, puis **PR `develop` → `main`** intitulée `Release X.Y — <résumé>`.
5. Merge sur GitHub (obligatoire, `main` protégée) → **déploie en prod**.
6. Tag la version **sur `main`, après le merge** :
   ```bash
   git switch main && git pull
   pnpm release:tag
   git push origin vX.Y
   ```

Chaque merge d'une feature sur `develop` ajoute sa ligne au `CHANGELOG.md` ; la mise en prod suit § Versioning et changelog.

## Hotfix (bug urgent en prod, sans attendre `develop`)

1. `git switch main && git pull && git switch -c hotfix/x` → correctif + sa ligne sous « Non publié » de `CHANGELOG.md` → `pnpm release:prepare --patch` → PR → merge dans `main`, déploie prod.
2. Tag du patch **sur `main`, après le merge** : `pnpm release:tag`, puis `git push origin vX.Y.Z`.
3. **Re-merge `main` → `develop`** (PR), sinon le fix régresse au prochain release.

## Versioning et changelog

Une version = une mise en prod. Numérotation `MAJEUR.MINEUR[.CORRECTIF]` : +1 au mineur par release, `.CORRECTIF` pour un hotfix, majeur sur décision de Benoît. Tag annoté `vX.Y` posé **après** le merge dans `main`. Historique : `CHANGELOG.md`, rétro-rempli de `v1.0` à `v2.62`.

- **À chaque merge sur `develop`** : une ligne sous « Non publié » de `CHANGELOG.md`.
- **Avant la PR `develop` → `main`** : `pnpm release:prepare` (hotfix : `--patch`). Il calcule la version suivante depuis le dernier tag, publie « Non publié », lance `check:carte` et commite `chore(release): vX.Y`. Il refuse un arbre sale, un « Non publié » vide ou une carte désynchronisée.
- **Le titre du merge** : `Release X.Y — <résumé>`.
- **Après le merge dans `main`** : `git checkout main && git pull`, `pnpm release:tag`, puis `git push origin vX.Y`, et retour sur `develop`.

## Règles d'or

- **Jamais de push direct sur `main`** (ni de commit auto — Claude demande toujours avant commit/push/tag).
- **Le tag se pose APRÈS le merge dans `main`** : un tag = « ce qui est réellement en prod ». Jamais avant.
- Le ruleset protège les **branches**, pas les tags → `git push origin vX.Y` passe.
- Pas de CI → le **gate de release = préprod verte + vérifs locales** faites avant la PR.

## Accord de mise en prod — ce que « PR » veut dire

Quand Benoît dit « PR », « fais une PR », « mets en prod » ou « go » **sur une mise en prod**, il attend le **cycle complet** : push → PR → merge → vérification du déploiement, sans redemander à chaque étape.

**Mais l'accord doit porter SUR LA PROD.** Un « oui » à un plan de travail n'est pas un go de déploiement (recadrage du 2026-09-11 : « arrête de mettre en prod sans mon accord »). Accord sur un plan, une approche, une liste de tâches → construire, committer, pousser sur `develop`, ouvrir la PR — **et s'arrêter là** en demandant le go.

- **Chemin de merge** : la PR `develop` → `main` se merge sur GitHub, précédée de `pnpm release:prepare` (sur `develop`) et suivie de `pnpm release:tag` (sur `main`) — cf. § Versioning et changelog. Si le mode auto de Claude Code bloque `gh pr merge`, l'agent s'arrête et le signale : Benoît merge lui-même, ou autorise explicitement la commande. **Un blocage du classifieur ne se contourne jamais par un autre chemin.**
- **Piège du checkout** : un fichier WIP d'une autre session fait échouer `git checkout main`. `git stash push -m "…" -- <fichier>`, merger, puis `git stash pop` une fois revenu sur `develop` — ne jamais embarquer ce WIP dans la release.
- **Une migration en production** (`supabase db push --db-url "$DATABASE_URL"`) est une mise en prod à part entière, même sans merge : elle se demande aussi. Le classifier la bloque — c'est le bon garde-fou, pas un obstacle à contourner.
- À signaler avant de merger, même avec un go clair : une migration à appliquer dans un ordre précis, du travail d'une autre session embarqué, un coût financier déclenché.
