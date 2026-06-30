# glagencyapp

Dashboard de performance (chatters / créatrices / CA) — rebuild propre de l'ancien
« Chatters Performance Dashboard ». **MyPuls reste la source** ; on reconstruit la
couche analytics en Next.js 16 + Supabase.

## Structure (monorepo pnpm)

```
apps/
  web/         Next 16 (App Router) + Tailwind v4 + shadcn — le dashboard
  ingestion/   worker cron : MyPuls → Supabase (tourne sur le VPS)
packages/
  core/        domaine pur : métriques + moteur d'insights (règles) + types  [@glagency/core]
  mypuls/      adaptateur MyPuls : login, fetch, parse                        [@glagency/mypuls]
  db/          Supabase : migrations SQL, RLS, RPC, types, client admin        [@glagency/db]
```

Convention front : **`app` (récup data) → `feature` (`<Feature>Template`) → composants**.
Détails : `.claude/skills/archi-web/SKILL.md` (mode 🅑 Standalone Supabase).

## Démarrer

```bash
pnpm install
cp .env.example .env            # puis renseigner Supabase + MyPuls
pnpm dev                        # apps/web sur http://localhost:3000
```

Base de données (Supabase) :

```bash
# migrations dans packages/db/supabase/migrations/ (0001 schéma, 0002 RLS, 0003 RPC)
supabase db push                # ou via le dashboard Supabase
pnpm db:types                   # régénère packages/db/src/types.ts
```

Ingestion (worker) :

```bash
pnpm ingest                     # lance le pipeline MyPuls → Supabase (squelette)
```

## Scripts racine

| Script | Effet |
|---|---|
| `pnpm dev` | dev server `apps/web` |
| `pnpm build` | build `apps/web` |
| `pnpm typecheck` | typecheck de tous les packages |
| `pnpm test` | tests (Vitest) des packages |
| `pnpm ingest` | worker d'ingestion |

## État

Squelette posé (structure + wiring + configs + migrations). Implémentation des features
à suivre (cf. `docs/superpowers/specs/2026-06-30-glagency-dashboard-design.md`).

## TODO

- [ ] Brancher un projet Supabase (clés dans `.env`) + appliquer les migrations.
- [ ] `pnpm db:types` pour générer les types réels.
- [ ] Sentry : `pnpm dlx @sentry/wizard@latest -i nextjs` dans `apps/web`.
- [ ] Implémenter ingestion + features une par une.
