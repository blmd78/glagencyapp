# Ingestion journalière

Worker **Node/TS** : `apps/ingestion`. Capture MyPuls → Supabase au grain **jour**.
Deux entrypoints, même logique (`src/pipeline.ts` `runPipeline()`) :
- `src/main.ts` — **CLI local** (`pnpm start [YYYY-MM-DD]`), lit le `.env`. C'est aussi lui
  que lance le cron **GitHub Actions** (mécanisme ACTIF, cf. section ci-dessous).
- `src/worker.ts` — **Cloudflare Worker** (Cron Trigger), secrets en bindings.
  **Non déployé** : exige le plan Workers Paid (5 $/mois), gardé si on change d'avis.

## Cron en production : GitHub Actions (gratuit — ACTIF)

`.github/workflows/ingestion.yml` : cron `43 23 * * *` **UTC** (≈ 01h43 Paris l'été) →
`pnpm --filter @glagency/ingestion start` sur un runner Ubuntu. Gratuit (~2 min/nuit sur
les 2000 min/mois du plan Free ; repo privé OK). Minute à :43 car le cron GitHub est
best-effort et sature au top de l'heure (retards de 30-60 min possibles à :00).

- **Secrets** (une fois) : repo GitHub → Settings → Secrets and variables → **Actions** →
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MYPULS_EMAIL`, `MYPULS_PASSWORD`, `MYPULS_API_KEY`.
- **Test sans polluer** : onglet Actions → « Ingestion MyPuls » → Run workflow →
  `day = 2026-07-01` (jour déjà complet, idempotent).
- **Suivi** : onglet Actions = logs de chaque nuit + email automatique si un run échoue.
- ⚠️ Cron désactivé par GitHub après **60 jours sans commit** (email d'alerte, un clic pour
  réactiver). Les runs planifiés peuvent glisser de quelques minutes (file GitHub) — sans
  impact, la journée Paris est finie depuis 2 h.

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

## Déploiement Cloudflare Worker (cible)

Prérequis : plan **Workers Paid** (le parsing cheerio des pages ~2 Mo dépasse le CPU du Free ;
cf. `[limits] cpu_ms` dans `wrangler.toml`).

```bash
cd apps/ingestion

# 1) Se connecter (ouvre le navigateur)
pnpm exec wrangler login

# 2) Injecter les secrets (une fois ; jamais dans git). Valeurs = celles du .env.
pnpm exec wrangler secret put SUPABASE_URL          # https://<ref>.supabase.co
pnpm exec wrangler secret put SUPABASE_SECRET_KEY   # clé service-role (BYPASS RLS)
pnpm exec wrangler secret put MYPULS_EMAIL
pnpm exec wrangler secret put MYPULS_PASSWORD
pnpm exec wrangler secret put MYPULS_API_KEY
pnpm exec wrangler secret put TRIGGER_TOKEN         # optionnel : autorise le déclenchement HTTP
# NE PAS mettre DATABASE_URL (inutile : supabase-js parle en REST via SUPABASE_URL).

# 3) Déployer (esbuild bundle les @glagency/* en TS + cheerio, pas besoin de tsx)
pnpm run deploy        # ⚠️ « run » obligatoire : `pnpm deploy` seul = commande interne pnpm

# 4) Tester sans attendre le cron
#    - en local : simule le déclenchement scheduled
pnpm cf:dev            # puis, dans un autre terminal : curl "http://localhost:8799/__scheduled"
#    - en prod : GET sur l'URL du Worker avec `Authorization: Bearer $TRIGGER_TOKEN`
#      (sans TRIGGER_TOKEN posé → 403 systématique : l'URL workers.dev est publique,
#       un déclenchement anonyme en journée créerait des données partielles)
#    - suivre les logs en direct :
pnpm exec wrangler tail
# ⚠️ tout déclenchement manuel = VRAIE ingestion → à faire en soirée uniquement.
```

Le Cron Trigger (`wrangler.toml` → `[triggers] crons = ["59 23 * * *"]`, **UTC**) tourne 24/7,
indépendant du Mac. 23:59 UTC ≈ 01:59 Paris (été) → capture la journée Paris **complète** qui
vient de se terminer.

### Backfill des jours passés
Le rattrapage part du dernier jour connu. Pour combler un gros trou (>quelques jours) sans
saturer les limites subrequests du Worker, seeder en local d'abord :
`pnpm start 2026-07-02` (répéter par jour), puis laisser le Worker au quotidien.

### À faire avant mise en ligne
- **Roter** `MYPULS_PASSWORD`, `MYPULS_API_KEY`, `SUPABASE_SECRET_KEY` et le mot de passe
  Postgres (auto-marqués « à ROTER » dans `.env`), puis mettre à jour les secrets Worker.
- **Vérifier que le login web marche** : la RLS est désormais active (migration `0004`), donc
  l'app n'affiche les données qu'aux utilisateurs **authentifiés**. La clé publishable seule
  ne lit plus rien (trou fermé).

## Cron local (stopgap, historique)
```
59 23 * * * cd <repo>/apps/ingestion && <node absolu> --import tsx src/main.ts >> <repo>/apps/ingestion/logs/cron.log 2>&1
```
⚠️ Dépend du Mac réveillé + Full Disk Access pour `/usr/sbin/cron`. Remplacé par le Worker.
