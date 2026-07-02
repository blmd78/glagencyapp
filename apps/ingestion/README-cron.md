# Ingestion journalière (bootstrap)

`scrape_day.py` — capture MyPuls → Supabase au grain **jour**.
**L'API MyPuls est entièrement dans ce fichier** (creds depuis `.env`, jamais en dur) :
`get()`/`get_all()` → endpoints `/team/money` (source), `/creators`, `/users`, `/team/messages/stats`.

- **Source** : `/team/money` (transactions horodatées, params `start`/`end`, paginé).
- **Sortie** : `creator_daily` (CA par modèle, exact) + dump brut `raw/<date>.json`
  (garde `message_id` pour l'attribution par chatteur, à transformer ensuite).
- **Sans argument** (= le cron) : capture **aujourd'hui** + **rattrape** les jours complets
  manquants (`max(date)+1 → hier`). Idempotent (upsert) → ni trou, ni doublon.
- **Un jour précis** : `python3 apps/ingestion/scrape_day.py 2026-07-01`

## Cron (stopgap local)
```
59 23 * * * cd <repo> && /opt/homebrew/bin/python3 apps/ingestion/scrape_day.py >> apps/ingestion/logs/cron.log 2>&1
```
⚠️ **Le Mac doit être réveillé à 23h59** (le cron ne réveille pas la machine). Nuit manquée →
le run suivant rattrape. `cron` peut exiger **Full Disk Access** (Réglages → Confidentialité →
Accès complet au disque → `/usr/sbin/cron`). Vérif : `tail apps/ingestion/logs/cron.log`.

## Cible : Cloudflare (hébergé)
Vrai déclencheur = **Cloudflare Worker + Cron Trigger** (`wrangler.toml` →
`[triggers] crons = ["59 23 * * *"]`) : tourne 24/7, indépendant du Mac. Le Worker (TS)
importera l'adaptateur **`@glagency/mypuls`** (où vivra le client API) et écrira dans Supabase.
⚠️ Workers = TS/JS → ce `scrape_day.py` est un **bootstrap jetable** ; la logique
(endpoints, pagination, agrégation par type) se porte en TS le moment venu.
