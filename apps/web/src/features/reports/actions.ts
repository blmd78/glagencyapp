'use server'

// Server Actions des comptes rendus journaliers. On ne rédige/supprime QUE le jour courant
// (todayParis, côté serveur) → un jour passé est FIGÉ (consultation seule), impossible à
// modifier/supprimer via l'action. Écriture = LE SIEN (RLS daily_reports, 0053/0064) ; garde
// applicative pageGuard('dashboard') = admin OU droit de page (chatteurs accordés compris).
// Le superadmin n'écrit pas (form non rendu).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, pageGuard, type ActionResult } from '@/lib/actions'
import { getReports } from './services/get-reports'
import { upsertReportInput } from './schema'
import type { Report } from './types'

/**
 * LECTURE à la demande — dérogation assumée à « les Server Actions sont pour les mutations ».
 * La pile de noms s'affiche repliée : charger d'emblée 30 jours de texte × tous les encadrants
 * gonflerait le payload du premier rendu pour du contenu que personne ne regarde. Déplier est
 * une action CLIENT, donc il faut un aller-retour ; entre une Server Action et un Route Handler
 * (réservé aux webhooks/OAuth/IA par les guidelines), l'action est le chemin le plus court.
 * `pageGuard` (et non `managerPageGuard`) : c'est une lecture, un chatteur y a droit pour lui.
 * La RLS `daily_reports_read` (0053/0064) reste le vrai cloisonnement.
 * Schéma inline : mono-usage, serveur uniquement, aucun resolver client à partager (§5).
 */
export async function loadReports(input: unknown): Promise<ActionResult<Report[]>> {
  return runAction({
    schema: z.object({ profileId: z.uuid() }),
    input,
    guard: pageGuard('dashboard'),
    handler: ({ profileId }) => getReports(profileId),
  })
}

/** Crée ou met à jour SON compte rendu DU JOUR (upsert sur (profile_id, day=aujourd'hui)). */
export async function upsertReport(input: unknown): Promise<ActionResult> {
  return runAction({
    schema: upsertReportInput,
    input,
    guard: pageGuard('dashboard'),
    handler: async ({ content }) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      // day = jour courant serveur : les jours passés ne passent jamais par ici.
      const { error } = await supabaseUpsert(profile.id, todayParis(), content)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/dashboard')
    },
  })
}

async function supabaseUpsert(profileId: string, day: string, content: string) {
  const supabase = await createClient()
  return supabase
    .from('daily_reports')
    .upsert({ profile_id: profileId, day, content, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,day' })
}
