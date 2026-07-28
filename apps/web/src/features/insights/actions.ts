'use server'

import { revalidatePath } from 'next/cache'
import { addDays, format, startOfWeek, subWeeks } from 'date-fns'
import { z } from 'zod'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getChatters } from '@/lib/services/get-chatters'
import {
  runAction,
  adminGuard,
  noGuard,
  requireWriteProfile,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { setInsightStateInput } from './schema'

/**
 * Changement de statut / note d'une carte. Client SESSION : la RLS (cloisonnement par
 * modèle, migration 0015) est la garde réelle — les verrous ci-dessous (admin exempté :
 * sortir d'« Ignoré », toucher une carte prise en charge par quelqu'un d'autre) sont une
 * défense en profondeur applicative, pas exprimables en RLS (ils dépendent de l'état
 * PRÉCÉDENT de la ligne, lu ici). Tout le contrôle vit en tête de handler, UNE SEULE FOIS
 * (patron §4 des guidelines — `noGuard` satisfait `runAction`).
 */
export async function setInsightState(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: setInsightStateInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireWriteProfile('insights')
      const supabase = await createClient()

      if (profile.role !== 'admin') {
        // Verrous : nécessitent une lecture DB (l'état PRÉCÉDENT de la carte).
        const { data: existing, error } = await supabase
          .from('insight_states')
          .select('status, updated_by')
          .eq('insight_key', values.key)
          .maybeSingle()
        if (error) throw new Error(error.message) // technique → runAction (Sentry + message générique)

        if (existing?.status === 'ignored' && values.status !== 'ignored') {
          throw new BusinessError('Seul un admin peut retirer le statut Ignoré')
        }
        if (
          existing?.status === 'in_progress' &&
          existing.updated_by != null &&
          existing.updated_by !== profile.id
        ) {
          throw new BusinessError('Carte prise en charge par quelqu’un d’autre')
        }
      }
      const { error } = await supabase.from('insight_states').upsert(
        {
          insight_key: values.key,
          status: values.status,
          note: values.note ?? null,
          // Le bilan n'est jamais effacé par un changement de statut — sauf reset explicite.
          ...(values.reset ? { bilan: null } : values.bilan != null ? { bilan: values.bilan } : {}),
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'insight_key' },
      )
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/insights')
    },
  })
}

// ── Export CSV perf chatteur × modèle (ADMIN) — matière pour une analyse IA d'affectation.

/** Échappement CSV : entoure de guillemets si nécessaire, double les guillemets internes. */
function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ChattersCsvExport {
  csv: string
  from: string
  to: string
}

/**
 * CSV de la performance croisée chatteur × modèle sur les 90 derniers jours (couvre tout
 * l'historique ingéré). Réservé aux admins. Réutilise le RPC chatters_report via getChatters.
 */
export async function exportChattersCsv(): Promise<ActionResult<ChattersCsvExport>> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    guard: adminGuard,
    handler: async () => {
      // Même référence qu'Insights : la dernière semaine complète (S-1, lundi → dimanche).
      // Jour métier Europe/Paris (pas UTC) — cf. todayParis, guideline data-loading.
      const lundiS1 = subWeeks(
        startOfWeek(new Date(`${todayParis()}T00:00:00`), { weekStartsOn: 1 }),
        1,
      )
      const from = format(lundiS1, 'yyyy-MM-dd')
      const to = format(addDays(lundiS1, 6), 'yyyy-MM-dd')
      const data = await getChatters({ from, to, label: `${from} → ${to}` }, { restricted: false })

      // Présence/réactivité/proposé/taux de conv n'existent qu'au grain chatteur — « proposé »
      // n'est pas ventilable par modèle (l'ingestion insère 0, cf. pipeline.ts) → colonnes
      // _chatteur répétées sur chaque ligne. Format FR (séparateur ; + virgule décimale) : avec
      // un point décimal, Excel FR lit « 37.25 » comme du texte et « 37 » comme un nombre.
      const frNum = (v: number | null) => (v == null ? null : String(v).replace('.', ','))
      const rows: string[] = [
        'chatter;modele;presence_h_chatter;reactivite_s_chatter;propose_chatter;taux_conv_pct_chatter;ca_eur;ppv_eur;tips_eur;vendu',
      ]
      for (const c of data.chatters) {
        for (const m of c.models) {
          rows.push(
            [
              c.name,
              m.model,
              frNum(c.presenceActiveH),
              frNum(c.reactiviteS),
              frNum(c.propose),
              frNum(c.tauxConv),
              frNum(m.ca),
              frNum(m.ppv),
              frNum(m.tips),
              frNum(m.vendu),
            ]
              .map(csvCell)
              .join(';'),
          )
        }
      }
      return { csv: rows.join('\n'), from, to }
    },
  })
}
