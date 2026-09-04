'use server'

// Écriture des réglages du relevé MyPuls. Garde explicite puis service-role, comme le reste des
// écritures de la Présence (0127) et de la Formation.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { noGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { shiftSettingsForm } from './schema'

/**
 * Enregistre la ligne unique `mypuls_shift_settings` (id = 1).
 *
 * ADMIN SEULEMENT, et c'est un choix de fond, pas une précaution : `idle_minutes` décide du
 * temps mesuré pour toute l'agence (3 → 10 min ajoute ~115 minutes médianes par chatteur et par
 * jour) et `coverage_threshold` décide de qui apparaît sous son poste. Les deux alimentent des
 * signalements Police, donc des retenues sur paie. Le miroir RLS est
 * `mypuls_shift_settings_admin_write` (0138:192).
 *
 * L'effet n'est PAS rétroactif, et c'est voulu : les runs déjà enregistrés gardent l'`idle` et
 * le seuil qui ont servi (`mypuls_shift_runs`), et la couverture stockée est le verdict de
 * MyPuls au moment du run. Changer le réglage change les runs SUIVANTS. Rejouer l'historique
 * avec la nouvelle valeur demanderait un rattrapage explicite (`pnpm --filter
 * @glagency/ingestion shifts <du> <au>`) — geste rare, qu'on ne déclenche pas depuis un
 * formulaire.
 *
 * `upsert` plutôt qu'`update` : la ligne est seedée par 0138, mais un `update` sur une base où
 * elle manquerait échouerait en silence (0 ligne touchée, aucune erreur).
 */
export async function saveShiftSettings(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: shiftSettingsForm,
    input: raw,
    guard: noGuard,
    handler: async (c) => {
      const profile = await requireAdminProfileLive()
      const admin = createAdminClient()
      const { error } = await admin.from('mypuls_shift_settings').upsert({
        id: 1,
        idle_minutes: c.idleMinutes,
        break_minutes: c.breakMinutes,
        coverage_threshold: c.coverageThreshold,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      if (error) throw new Error(error.message)
      // Mode `layout` : le seuil et le regroupement sont relus par le Relevé et par la fiche
      // d'activité, pas seulement par cette page. Revalider le seul chemin des réglages
      // laisserait le relevé afficher l'ancien seuil jusqu'à sa prochaine invalidation.
      revalidatePath('/chatter/presence', 'layout')
    },
  })
}
