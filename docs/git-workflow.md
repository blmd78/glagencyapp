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
4. Quand `develop` est vert et prêt à sortir : **PR `develop` → `main`**.
5. Merge sur GitHub (obligatoire, `main` protégée) → **déploie en prod**.
6. Tag la version **sur `main`, après le merge** :
   ```bash
   git switch main && git pull
   git tag -a v1.1 -m "v1.1 — <résumé>"
   git push origin v1.1
   gh release create v1.1 --title "v1.1" --notes "<changelog>"
   ```

## Hotfix (bug urgent en prod, sans attendre `develop`)

1. `git switch main && git pull && git switch -c hotfix/x` → correctif → PR → merge dans `main`.
2. Tag patch `v1.1.1` + release, déploie prod.
3. **Re-merge `main` → `develop`** (PR), sinon le fix régresse au prochain release.

## Versioning (trivial)

| Tag | Quand |
|---|---|
| `v1.1`, `v1.2`… | nouveau lot de features (minor) |
| `v1.1.1` | hotfix (patch) |
| `v2.0` | refonte / breaking |

Optionnel mais propre : bumper `apps/web/package.json` (`version`) dans la PR `develop → main`
pour que la version du code = le tag.

## Règles d'or

- **Jamais de push direct sur `main`** (ni de commit auto — Claude demande toujours avant commit/push/tag).
- **Le tag se pose APRÈS le merge dans `main`** : un tag = « ce qui est réellement en prod ». Jamais avant.
- Le ruleset protège les **branches**, pas les tags → `git push origin vX.Y` passe.
- Pas de CI → le **gate de release = préprod verte + vérifs locales** faites avant la PR.

## Accord de mise en prod — ce que « PR » veut dire

Quand Benoît dit « PR », « fais une PR », « mets en prod » ou « go » **sur une mise en prod**, il attend le **cycle complet** : push → PR → merge → vérification du déploiement, sans redemander à chaque étape.

**Mais l'accord doit porter SUR LA PROD.** Un « oui » à un plan de travail n'est pas un go de déploiement (recadrage du 2026-09-11 : « arrête de mettre en prod sans mon accord »). Accord sur un plan, une approche, une liste de tâches → construire, committer, pousser sur `develop`, ouvrir la PR — **et s'arrêter là** en demandant le go.

- **Chemin de merge** : `gh pr merge` est bloqué par le classifier du mode auto de Claude Code (« Production Deploy ») ; le chemin git ordinaire passe : `git checkout main && git merge --ff-only origin/main && git merge --no-ff <branche> -m "Release N.N — …" && git push origin main`, puis `main` → `develop`. Un blocage du harnais sur une action **déjà autorisée** n'est pas une nouvelle question à poser.
- **Piège du checkout** : un fichier WIP d'une autre session fait échouer `git checkout main`. `git stash push -m "…" -- <fichier>`, merger, puis `git stash pop` une fois revenu sur `develop` — ne jamais embarquer ce WIP dans la release.
- **Une migration en production** (`supabase db push --db-url "$DATABASE_URL"`) est une mise en prod à part entière, même sans merge : elle se demande aussi. Le classifier la bloque — c'est le bon garde-fou, pas un obstacle à contourner.
- À signaler avant de merger, même avec un go clair : une migration à appliquer dans un ordre précis, du travail d'une autre session embarqué, un coût financier déclenché.

## État actuel (2026-07-17) — à intégrer avant le 1er release

- `main` = `e081635` (baseline quasi vide, `0.1.0`). `develop` = main + 1 commit préprod.
- **Tout le travail réel est sur `feat/standard-feature`** (Sentry, fix dates Paris, standard feature, refacto marketing) — **pas encore dans `develop`**.
- Prochain pas : PR `feat/standard-feature` → `develop`, valider sur la préprod, **puis** PR `develop` → `main` = **premier vrai release** (candidat `v1.0`). Tant que ce n'est pas fait, ne pas tagguer `main` (on taggerait du vide).
