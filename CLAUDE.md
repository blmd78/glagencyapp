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
- **2 faces du CRM = préfixe d'URL** : `Chatteurs` (`/chatter/*`) et `Marketing`
  (`/marketing/*`). Une seule source : `config/workspaces.ts` (`WORKSPACES`). La face
  active se déduit du `pathname` (`workspaceForPath`) ; la sidebar (`AppSidebar` +
  `WorkspaceSwitcher`) affiche la nav de cette face. Ajouter/remplir une face = éditer
  `WORKSPACES` + créer les routes sous son `basePath`. Ne pas réintroduire de routes à plat.

## Design

Spec : `docs/superpowers/specs/2026-06-30-glagency-dashboard-design.md`.

## TODO scaffold

- [ ] Brancher Supabase réel (projet + clés dans `.env`) et lancer les migrations.
- [ ] `supabase gen types` → `packages/db/src/types.ts`.
- [ ] Sentry : `pnpm dlx @sentry/wizard@latest -i nextjs` dans `apps/web`.
- [ ] Implémenter les features une par une (cf. plan d'implémentation à venir).
