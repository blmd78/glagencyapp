'use server'

import { revalidatePath } from 'next/cache'
import { addDays, format, startOfWeek, subWeeks } from 'date-fns'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, requireAccess } from '@/lib/auth'
import { getChatters } from '@/features/chatters/services/get-chatters'
import { bilanSchema } from './schema'

/** Changement de statut / note d'une carte. Client SESSION : la RLS (admin-only) est la garde réelle. */

const input = z
  .object({
    key: z.string().min(1).max(200),
    status: z.enum(['new', 'in_progress', 'resolved', 'ignored']),
    note: z.string().max(2000).nullish(),
    bilan: bilanSchema.nullish(),
    /** Réinitialisation complète : statut new + note et bilan effacés. */
    reset: z.boolean().optional(),
  })
  // Garde SERVEUR (pas seulement UI) : pas de « Résolu » sans bilan structuré.
  .refine((v) => v.status !== 'resolved' || v.bilan != null, {
    message: 'Un bilan est requis pour passer en Résolu',
  })

type Result = { success: true } | { success: false; error: string }

export async function setInsightState(raw: unknown): Promise<Result> {
  const profile = await requireAccess('insights')
  const parsed = input.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Saisie invalide' }
  }
  const { key, status, note, bilan, reset } = parsed.data

  const supabase = await createClient()

  // Verrous (admins exemptés) : sortir d'« Ignoré », et toucher à une carte prise
  // en charge (« En cours ») par quelqu'un d'autre.
  if (profile.role !== 'admin') {
    const { data: existing } = await supabase
      .from('insight_states')
      .select('status, updated_by')
      .eq('insight_key', key)
      .maybeSingle()
    if (existing?.status === 'ignored' && status !== 'ignored') {
      return { success: false, error: 'Seul un admin peut retirer le statut Ignoré' }
    }
    if (
      existing?.status === 'in_progress' &&
      existing.updated_by != null &&
      existing.updated_by !== profile.id
    ) {
      return { success: false, error: 'Carte prise en charge par quelqu\'un d\'autre' }
    }
  }
  const { error } = await supabase.from('insight_states').upsert(
    {
      insight_key: key,
      status,
      note: note ?? null,
      // Le bilan n'est jamais effacé par un changement de statut — sauf reset explicite.
      ...(reset ? { bilan: null } : bilan != null ? { bilan } : {}),
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: 'insight_key' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/insights')
  return { success: true }
}

// ── Export CSV perf chatteur × modèle (ADMIN) — matière pour une analyse IA d'affectation.

/** Échappement CSV : entoure de guillemets si nécessaire, double les guillemets internes. */
function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV de la performance croisée chatteur × modèle sur les 90 derniers jours (couvre tout
 * l'historique ingéré). Réservé aux admins. Réutilise le RPC chatters_report via getChatters.
 */
export async function exportChattersCsv(): Promise<
  { csv: string; from: string; to: string } | { error: string }
> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { error: 'Réservé aux admins' }

  // Même référence qu'Insights : la dernière semaine complète (S-1, lundi → dimanche).
  const lundiS1 = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1)
  const from = format(lundiS1, 'yyyy-MM-dd')
  const to = format(addDays(lundiS1, 6), 'yyyy-MM-dd')
  const data = await getChatters({ from, to, label: `${from} → ${to}` }, { restricted: false })

  // Présence/réactivité n'existent qu'au grain chatteur (pas par modèle) → répétées sur
  // chaque ligne, suffixées _chatteur. Format FR (séparateur ; + virgule décimale) : avec un
  // point décimal, Excel FR lit « 37.25 » comme du texte et « 37 » comme un nombre.
  const frNum = (v: number | null) => (v == null ? null : String(v).replace('.', ','))
  const rows: string[] = [
    'chatteur;modele;presence_h_chatteur;reactivite_s_chatteur;propose;taux_conv_pct;ca_eur;ppv_eur;tips_eur;vendu',
  ]
  for (const c of data.chatters) {
    for (const m of c.models) {
      rows.push(
        [
          c.name,
          m.model,
          frNum(c.presenceActiveH),
          frNum(c.reactiviteS),
          frNum(m.propose),
          frNum(m.tauxConv),
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
}
