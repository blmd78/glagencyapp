# glagencyapp — instructions projet

Dashboard de performance (chatters / créatrices / CA) — rebuild propre de l'ancien
« Chatters Performance Dashboard ». **MyPuls reste la source** ; on reconstruit la
couche analytics.

## Architecture web — skill `archi-web`

Ce projet suit **`.claude/skills/archi-web/SKILL.md`** (adapté Supabase). Invoque-le
dès que tu touches à `apps/web/`.

**Mode : 🅑 Standalone (Supabase)** — pas d'API externe ; Server Components query
supabase-js direct (RLS), **mutations en Server Actions** (`features/<f>/actions.ts`),
Route Handlers réservés aux cas spéciaux (IA, webhooks).

## Stack

- **Monorepo** : pnpm workspaces (pas de Turborepo). `apps/*` + `packages/*`.
- **Front** : Next.js 16 (App Router, RSC) + Tailwind v4 + shadcn/ui.
- **Données/Auth** : Supabase (Postgres + Auth **OTP email** + **RLS**), `@supabase/ssr`.
- **Domaine** : `@glagency/core` (pur, testé Vitest) — métriques + moteur d'insights (règles).
- **Ingestion** : `@glagency/mypuls` (adaptateur) + `apps/ingestion` (worker cron) → Supabase.

## Packages

| Package | Rôle |
|---|---|
| `@glagency/web` (`apps/web`) | dashboard Next.js |
| `@glagency/ingestion` (`apps/ingestion`) | worker cron MyPuls → Supabase |
| `@glagency/core` (`packages/core`) | domaine pur : métriques + insights + types |
| `@glagency/mypuls` (`packages/mypuls`) | scrape MyPuls (session `money-team` + `dashboard/stats`) = **source des chiffres** |
| `@glagency/db` (`packages/db`) | Supabase : migrations, RLS, types générés, client admin |

## Règles

- **Convention `app → feature(template) → composants`** : `app/**/page.tsx` récupère la
  donnée (via `features/<f>/services/`), passe en props à `<Feature>Template.tsx` qui
  appelle les composants. **Aucun fetch dans une feature.**
- **Frontière = tables Supabase.** `packages/core` ne dépend de rien (pur). Personne n'importe `web`.
- **Secrets en env uniquement** (cf. `.env.example`) — jamais en clair dans le code.
- **RLS = enforcement réel** du cloisonnement par modèle ; l'UI n'est qu'optimiste.
- **Data-loading & templates** : suivre `docs/guidelines-data-loading.md` — agrégation des
  tables de faits en RPC SQL `SECURITY INVOKER` (sinon `fetchAll` obligatoire, jamais de
  `select` nu → troncature à 1000 lignes), `Template` = Server Component + feuille client,
  `use cache` uniquement sur du global (jamais RLS cookie-bound), `proxy.ts` dans `src/`
  + `docs/guidelines-standard-feature.md` (squelette de feature, loading/erreurs/mutations/
  forms — checklist nouvelle feature) + `docs/guidelines-socle.md` (briques transverses du
  batch 0 : Sentry serveur, cache/`api/revalidate`, headers, `env`, config Next).
- **2 faces du CRM = préfixe d'URL** : `Chatteurs` (`/chatter/*`) et `Marketing`
  (`/marketing/*`). Une seule source : `config/workspaces.ts` (`WORKSPACES`). La face
  active se déduit du `pathname` (`workspaceForPath`) ; la sidebar (`AppSidebar` +
  `WorkspaceSwitcher`) affiche la nav de cette face. Ajouter/remplir une face = éditer
  `WORKSPACES` + créer les routes sous son `basePath`. Ne pas réintroduire de routes à plat.
- **To-do personnelle** : 2e onglet de `/chatter/planning` (`?vue=todo`), une liste par
  encadrant (`todos`, RLS `can_write_todo_of`, migration `0067`). Chacun gère la sienne ; la
  hiérarchie peut y déposer une tâche (mêmes règles que le planning). Aucun slug dédié : le
  droit vient de « Planning ». Deux vues — **liste** (défaut) et **kanban** (glisser-déposer,
  `dnd-kit`) — basculées par un toggle dont la préférence est persistée en cookie
  (`todos_affichage`), lu côté serveur au chargement suivant. Filtre par release en local
  (`useState`, pas d'URL) dans `todos-view.tsx`, appliqué aux deux vues. Claude y écrit en SQL
  direct (`created_by` null → « Claude »).

## Données MyPuls — workflow d'ajout

Benoit donne les URLs MyPuls **dans le chat** (pas de fichier d'inventaire). Pour chaque page :

1. `pnpm --filter @glagency/ingestion capture <url>` → sauvegarde le brut authentifié
   (login auto via `MYPULS_EMAIL`/`MYPULS_PASSWORD`) dans `apps/ingestion/raw/pages/`.
2. Inspecter le fichier capturé, écrire le parser dans `packages/mypuls/src/endpoints/`.
3. Brancher dans `apps/ingestion` (pipeline → Supabase), puis dans la feature web.

## Migrations (Supabase)

Migrations dans `packages/db/supabase/migrations/NNNN_slug.sql` — **séquence contiguë
`0001..NNNN` alignée sur `schema_migrations` en prod** (nettoyée au commit `36ae438`).
**Ne pas re-renuméroter** l'existant. Pas de `config.toml` (juste le dossier `migrations/`).

Ajouter une migration :
1. Créer `NNNN_slug.sql` (numéro suivant). Convention : `text` + `check`, **jamais
   `create type ... enum`**.
2. Appliquer **et** enregistrer en une étape :
   `cd packages/db && supabase db push --db-url "$DATABASE_URL"` (ajouter `--dry-run` pour
   prévisualiser — doit dire « Remote database is up to date » quand tout est à jour). Le
   `supabase link` est **cassé** sur ce projet → toujours `--db-url`, jamais `link`.
3. Régénérer `packages/db/src/types.ts` si le schéma change.

**Piège à l'origine du nettoyage `36ae438`** : appliquer une migration à la main
(`psql "$DATABASE_URL" -f …`) SANS l'enregistrer dans `schema_migrations` désaligne
l'historique et casse `db push`. Préférer `db push` (applique ET enregistre). Extraire l'URL
en brut (`grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`), jamais
`source .env` (corrompt la variable) ; connexion directe port 5432, pas le pooler 6543.

## Design

Spec : `docs/superpowers/specs/2026-06-30-glagency-dashboard-design.md`.
