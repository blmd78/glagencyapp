import { login } from '@glagency/mypuls'
import { runRules } from '@glagency/core'
import { createAdminClient } from '@glagency/db'

/**
 * Pipeline quotidien (cron 06:00 Europe/Paris) : fetch MyPuls → transform → upsert Supabase.
 * Idempotent (upserts par clés naturelles). Cf. spec §7.
 *
 * Étapes :
 *   1. login MyPuls + fetch (mois courant, dernière semaine complète, semaine en cours, mois précédent)
 *   2. transform (core) → chatter_daily / creator_daily / chatter_period_stats
 *   3. runRules (core) → insights
 *   4. upsert dans Supabase (service-role)
 *   5. notify en cas d'échec (Telegram/email)
 */
export async function runPipeline(): Promise<void> {
  // Références aux briques (évite les warnings "unused" tant que c'est un squelette).
  void login
  void runRules
  void createAdminClient
  throw new Error('pipeline non implémenté — squelette (cf. spec §7)')
}
