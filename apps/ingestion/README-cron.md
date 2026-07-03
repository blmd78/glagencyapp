# Ingestion journalière

`apps/ingestion` capture MyPuls → Supabase au grain **jour**. Deux entrypoints, même logique
métier (`src/pipeline.ts` `runPipeline()`) :
- `src/main.ts` — **CLI local** (`pnpm start [YYYY-MM-DD]`), lit le `.env`. Utilise le parser
  money-team **cheerio** (Node). Sert au dev / backfill.
- `src/worker.ts` — **Cloudflare Worker** (Cron Trigger) = **mécanisme de prod ACTIF**.
  Utilise le parser money-team **HTMLRewriter** (cf. plus bas), secrets en bindings.

## Ce que fait un run (par jour)
1. **`creator_daily`** — **dashboard prioritaire** : `dashboard/stats` (CA complet ventilé :
   tips/abo/ppv/mod/renew/push/affiliation/live) + `dashboard/subscriptions`
   (`new_subs`, `renew_subs`, `subs_active`). **Fallback `/team/money`** (API, messagerie seule)
   si le dashboard tombe.
2. **`chatter_daily` + `chatter_creator_daily`** — scrape `creator/messaging-money-team`
   (l'API n'attribue pas l'expéditeur). Résumé → chatteurs, transactions → attribution par modèle.
3. Chaque flux en `try/catch` : un flux (ou un jour) qui casse ne bloque pas les autres.

**Sans argument** (= le cron) : re-capture depuis le dernier jour connu (souvent partiel) →
aujourd'hui. Idempotent (upsert) → ni trou, ni doublon. Un jour précis : `pnpm start 2026-07-01`.

## Prod : Cloudflare Worker (plan Free, gratuit — ACTIF)

Déployé sur `glagency-ingestion.<compte>.workers.dev`. Cron Trigger (`wrangler.toml`) :
**00h05 Paris toute l'année** — juste après minuit ET après le snapshot abonnés MyPuls de
23h59, donc la journée capturée est **complète** (à 23h49 on ratait les ventes 23h49–minuit
+ le snapshot → écarts vs MyPuls chaque matin). 2 lignes UTC (les crons Cloudflare ignorent
l'heure d'été) : `5 22 * 4-10 *` (été, 22h05 UTC) + `5 23 * 1-3,11-12 *` (hiver, 23h05 UTC).

### Pourquoi HTMLRewriter et pas cheerio
Le plan **Free** ne permet pas la directive `[limits] cpu_ms` (erreur 100328). Le parser
money-team a donc été réécrit de **cheerio** (construit un DOM complet, ~110 ms CPU sur la page
de 1,75 Mo) vers **HTMLRewriter** (parseur natif streaming en Rust, `src/money-team-hr.ts`) qui
ne matche que les cellules ciblées. **Mesure réelle sur le Worker déployé** : run complet =
**~70 ms CPU** (`outcome=ok`), sortie identique champ-par-champ à cheerio (vérifié). Le CLI Node
garde cheerio ; le Worker injecte HTMLRewriter via `runPipeline(day, { fetchMoneyTeam })`.

### (Re)déployer
```bash
cd apps/ingestion
pnpm exec wrangler login            # une fois (ouvre le navigateur)
pnpm run deploy                     # ⚠️ « run » obligatoire : `pnpm deploy` = commande interne pnpm
```
Secrets (une fois, jamais dans git ; déjà posés) :
```bash
pnpm exec wrangler secret put SUPABASE_URL          # https://<ref>.supabase.co
pnpm exec wrangler secret put SUPABASE_SECRET_KEY   # clé service-role (BYPASS RLS)
pnpm exec wrangler secret put MYPULS_EMAIL
pnpm exec wrangler secret put MYPULS_PASSWORD
pnpm exec wrangler secret put MYPULS_API_KEY
pnpm exec wrangler secret put TRIGGER_TOKEN         # protège le déclenchement HTTP manuel
# PAS DATABASE_URL (inutile : supabase-js parle en REST via SUPABASE_URL).
```

### Tester / suivre
- **Déclenchement manuel** (VRAIE ingestion → soirée uniquement, sinon jour partiel) :
  `curl -H "Authorization: Bearer <TRIGGER_TOKEN>" "https://…workers.dev/?day=2026-07-01"`.
  `?day=` rejoue un jour précis (idempotent) ; sans lui = rattrapage jusqu'à aujourd'hui.
  Sans le bon token → 403 (l'URL workers.dev est publique).
- **Vérif du parser sans déployer** : `pnpm cf:dev` puis
  `curl -X POST --data-binary @raw/pages/creator-messaging-money-team.html localhost:8799/__parse-moneyteam`
  (route de debug, désactivée en prod quand `TRIGGER_TOKEN` est posé).
- **Logs + CPU en direct** : `pnpm exec wrangler tail --format json` (champ `cpuTime`).
- **Métriques** : dashboard Cloudflare → Worker → Metrics (CPU time, invocations, erreurs).

### Backfill des jours passés
Le rattrapage part du dernier jour connu. Pour un gros trou, seeder en local :
`pnpm start 2026-07-02` (par jour), puis laisser le Worker au quotidien.

### À faire avant mise en ligne définitive
- **Roter** `MYPULS_PASSWORD`, `MYPULS_API_KEY`, `SUPABASE_SECRET_KEY` et le mot de passe
  Postgres (marqués « à ROTER » dans `.env`), puis refaire les `wrangler secret put`.
- ⚠️ CPU ~70 ms/run : confortable pour un cron nocturne, mais si Cloudflare durcit
  l'application de la limite CPU du Free, surveiller les `outcome` dans les métriques.
