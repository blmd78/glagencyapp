# Ingestion journalière (bootstrap)

`scrape_day.py` — capture MyPuls -> Supabase au grain **jour**.

- **Source** : `/team/money` (transactions horodatées, params `start`/`end`, paginé).
- **Sortie** : `creator_daily` (CA par modèle, exact) + dump brut `raw/<date>.json`
  (garde `message_id` pour l'attribution par chatteur, à transformer ensuite).
- **Manuel** : `python3 apps/ingestion/scrape_day.py [YYYY-MM-DD]`
- **Cron** : `59 23 * * *` (voir `crontab -l`).

## ⚠️ Fiabilité (macOS)
1. **Le Mac doit être allumé/réveillé à 23h59** (cron ne réveille pas la machine).
2. `cron` peut nécessiter **Full Disk Access** : Réglages → Confidentialité →
   Accès complet au disque → ajouter `/usr/sbin/cron`.
3. Vérifier le lendemain : `tail apps/ingestion/logs/cron.log` + `raw/<date>.json`.

À terme : porter dans le worker tsx (`src/pipeline.ts`) + hébergement (pas un laptop).
