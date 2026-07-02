# Ingestion journalière

Worker **Node/TS** : `apps/ingestion` (`src/main.ts` → `src/pipeline.ts`).
Capture MyPuls → Supabase au grain **jour**.

- **Client API** : `@glagency/mypuls` (`fetchTeamMoney`) — endpoint `/team/money`,
  token `X-API-TOKEN` depuis `.env` (`MYPULS_API_KEY`).
- **Écriture** : `@glagency/db` (`createAdminClient`, supabase-js service-role).
- **Sortie** : `creator_daily` (CA par modèle, exact) + dump brut `raw/<date>.json`
  (garde `message_id` pour l'attribution par chatteur, à transformer ensuite).
- **Sans argument** (= le cron) : capture **aujourd'hui** + **rattrape** les jours complets
  manquants (`max(date)+1 → hier`). Idempotent (upsert `creator_id,date`) → ni trou, ni doublon.
- **Un jour précis** : `pnpm --filter @glagency/ingestion start 2026-07-01`

## Cron (stopgap local)
```
59 23 * * * cd <repo>/apps/ingestion && <node> --import tsx src/main.ts >> <repo>/apps/ingestion/logs/cron.log 2>&1
```
(`<node>` = chemin absolu, ex. `~/.nvm/versions/node/v24.5.0/bin/node` — le cron n'a pas le PATH nvm.)
⚠️ **Le Mac doit être réveillé à 23h59** (le cron ne réveille pas la machine). Nuit manquée →
le run suivant rattrape. `cron` peut exiger **Full Disk Access** (Réglages → Confidentialité →
Accès complet au disque → `/usr/sbin/cron`). Vérif : `tail apps/ingestion/logs/cron.log`.

## Cible : Cloudflare (hébergé)
Vrai déclencheur = **Cloudflare Worker + Cron Trigger** (`wrangler.toml` →
`[triggers] crons = ["59 23 * * *"]`) : tourne 24/7, indépendant du Mac. Le Worker réutilise
tel quel `@glagency/mypuls` (client API) + `@glagency/db` (supabase-js marche sur Workers).
Seule adaptation : injecter les secrets via les bindings Cloudflare au lieu du `.env`.
