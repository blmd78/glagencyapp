# glagencyapp — instructions projet

Dashboard de performance (chatters / créatrices / CA) — rebuild propre de l'ancien
« Chatters Performance Dashboard ». **MyPuls reste la source** ; on reconstruit la
couche analytics.

## Multi-agent — Codex et Claude Code

**Source unique : ce fichier.** `CLAUDE.md` est un **symlink** vers ce fichier (`CLAUDE.md -> AGENTS.md`) : écrire dans l'un, c'est écrire dans l'autre — ne jamais le remplacer par une copie ni par un vrai fichier. Codex lit `AGENTS.md` nativement, de la racine git jusqu'au cwd ; Claude Code lit le `CLAUDE.md`, donc ce même contenu (symlink vérifié sur Claude Code 2.1.278).

**Skills : un dossier, deux agents.** `.claude/skills/` porte les skills ; `.agents/skills` est un **symlink** vers lui (`-> ../.claude/skills`) et c'est le root que Codex scanne — ne jamais le supprimer ni le remplacer par une copie. Une nouvelle skill dans `.claude/skills/` apparaît dans les deux agents sans aucune action. Le sens inverse ne marche pas : Claude Code ne lit pas `.agents/skills`. `.claude/skills/` est **versionné** depuis le 2026-09-22 (`.gitignore` : `.claude/*` puis `!.claude/skills/`) — sans ça le symlink serait cassé sur toute autre machine.

**Docs** : `ARCHITECTURE.md` (description du système) · `docs/git-workflow.md` (branches, releases, accord de prod) · `docs/guidelines-*.md` (standard feature, socle, data-loading, UI) · `docs/audit-normes.md` · `docs/dettes-ouvertes.md` · `docs/ia-formation-couts.md` · `docs/runbook-uncove.md` · `docs/perf-vercel-prefetch.md`.

**Carte, changelog, release** : `docs/CARTE.md` dit où vit chaque feature — la lire avant d'explorer le code. Chaque merge sur `develop` ajoute sa ligne sous « Non publié » dans `CHANGELOG.md`. **Toute mise en prod passe par `pnpm release:prepare` puis `pnpm release:tag`** : `docs/git-workflow.md`.

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

**Tout le CA est en euros** (décision de Benoît, 2026-09-21) : aucune conversion, aucun taux de change, aucune colonne `currency` sur les tables de faits — même quand MyPuls étiquette un compte en USD (Carla, id `3623`) ; c'est lui qui sait ce qui est réellement encaissé.

**Un ticket qu'un agent dépose dans la to-do CRM** (insert SQL, auteur « Claude ») se traite par l'agent lui-même dans la foulée, puis passe en `done` (transition permise par le trigger `0086`/`0087`) — la to-do est un journal, pas un backlog à relancer. Seuls restent ouverts, et signalés dans le chat, ceux qui exigent une décision produit.

**Règles métier par domaine** (to-do, suivi chatteurs, rapport police, relevé MyPuls, équipes et quotas, codes Snap, Uncove, liens marketing…) : `ARCHITECTURE.md` § Domaines — **à lire avant de toucher la feature concernée** ; `docs/CARTE.md` y renvoie depuis la ligne de chaque feature. Exception : la **Formation** (catalogue, entraînement, recrutement, roues, `/formation/*`) vit en § 2 « Les 3 faces du CRM », que la carte ne signale pas.

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

**État au 2026-09-24** : prod = UAT = **0174**. **Prochaine migration = `0175`**.

**Piège réseau (2026-09-22)** : `db.<ref>.supabase.co` n'a plus d'adresse IPv4 et la machine ne
route pas l'IPv6 → `supabase db push --db-url` échoue en « no route to host ». Passer par le
**pooler en mode session** (IPv4, port 5432, région `eu-west-3`) :
`postgresql://postgres.<ref>:<mot-de-passe>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`
— le mot de passe s'extrait de `DATABASE_URL`. Même URL pour `supabase gen types typescript`.

**Piège à l'origine du nettoyage `36ae438`** : appliquer une migration à la main
(`psql "$DATABASE_URL" -f …`) SANS l'enregistrer dans `schema_migrations` désaligne
l'historique et casse `db push`. Préférer `db push` (applique ET enregistre). Extraire l'URL
en brut (`grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`), jamais
`source .env` (corrompt la variable) ; connexion directe port 5432, pas le pooler 6543.

## Design

Spec : `docs/superpowers/specs/2026-06-30-glagency-dashboard-design.md`.
