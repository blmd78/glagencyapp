'use server'

// Roue des modules — le CHATTER lance pour lui-même, en consommant un tour gagné en finissant un
// module (0136). C'est la différence avec la roue nº 1, où l'encadrant lance pour quelqu'un.
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (aucune policy d'écriture
// `authenticated` sur les tickets ni les spins) — TOUJOURS après la garde applicative. Seule la
// config admin s'écrit sous RLS.
//
// Le TIRAGE est décidé ici (crypto.randomInt) : le client ne fait qu'animer jusqu'au secteur rendu.

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { mondayOf, pickWeighted, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { segmentsToJson, toSegments } from './mappers'
import { moduleWheelConfigForm } from './schema'
import type { ModuleSpinResult } from './types'

/**
 * Le tirage — décidé ICI (crypto), enregistré au nom du chatter, adossé au ticket qu'il consomme.
 *
 * `requirePageProfileLive` et pas `requirePageProfile` : la variante `…Live` refuse la consultation
 * « en tant que ». Une impersonation ne verse jamais d'argent.
 */
export async function spinModuleWheel(): Promise<ActionResult<ModuleSpinResult>> {
  return runAction({
    // Aucune entrée : on ne tire que pour soi, avec son plus vieux ticket.
    schema: z.object({}),
    input: {},
    guard: noGuard,
    handler: async (): Promise<ModuleSpinResult> => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const supabase = await createClient()
      const [ticketRes, cfgRes] = await Promise.all([
        supabase
          .from('training_wheel_tickets')
          .select('id, module_id')
          .eq('profile_id', profile.id)
          .not('module_id', 'is', null)
          .is('used_at', null)
          // Le plus ancien d'abord : les tours s'accumulent, on les joue dans l'ordre où ils ont
          // été gagnés — c'est ce que dit l'historique ensuite.
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from('training_module_wheel_config').select('segments').eq('id', 1).single(),
      ])
      if (ticketRes.error) throw new Error(ticketRes.error.message)
      if (cfgRes.error) throw new Error(cfgRes.error.message)
      if (!ticketRes.data) throw new BusinessError('Tu n’as aucun tour disponible')

      const segments = toSegments(cfgRes.data.segments)
      const pick = pickWeighted(segments, (n) => randomInt(0, n))
      const admin = createAdminClient()

      // ORDRE CRITIQUE : le spin D'ABORD. `training_wheel_spins.ticket_id` est UNIQUE — c'est
      // cette contrainte, et rien d'autre, qui interdit de jouer deux fois le même tour (double
      // clic, deux onglets, rejeu réseau). Si elle est violée, RIEN n'a été écrit.
      // L'ordre inverse (marquer le ticket puis insérer) brûlerait le ticket sur un insert raté.
      const { error: sErr } = await admin.from('training_wheel_spins').insert({
        profile_id: profile.id,
        ticket_id: ticketRes.data.id,
        spun_by: profile.id,
        week: mondayOf(todayParis()),
        // Roue à UN étage : le secteur est le lot. `won` toujours vrai — il n'y a pas de perdant.
        sector_label: pick.item.label,
        won: true,
        prize_label: pick.item.label,
        amount_eur: pick.item.amountEur,
      })
      // `23505` = violation de l'unique sur `ticket_id`, et RIEN d'autre ne peut la produire — donc
      // c'est le SEUL code qu'on traduit en refus métier (double clic, deux onglets, rejeu réseau).
      // Toute autre erreur (colonne manquante, RLS fermée, panne réseau) doit remonter en `Error`
      // nue : `runAction` ne capture à Sentry QUE les `Error` nues, pas les `BusinessError` — les
      // faire toutes passer pour « déjà joué » masquerait une vraie panne, y compris à Sentry.
      if (sErr) {
        if (sErr.code === '23505') throw new BusinessError('Ce tour vient d’être joué — recharge la page')
        throw new Error(sErr.message)
      }

      const { error: tErr } = await admin
        .from('training_wheel_tickets')
        .update({ used_at: new Date().toISOString() })
        .eq('id', ticketRes.data.id)
      if (tErr) throw new Error(tErr.message)

      // PAS de revalidatePath ici, volontairement : une Server Action qui revalide renvoie le RSC
      // payload rafraîchi AVEC sa réponse — « Mes gains » afficherait le montant avant même que la
      // roue ait fini de tourner. Le rafraîchissement se fait côté client, après la révélation.
      return { segmentIndex: pick.index, label: pick.item.label, amountEur: pick.item.amountEur }
    },
  })
}

/** Config admin — la ligne 1 est seedée par 0136, donc c'est toujours un update de fait. */
export async function saveModuleWheelConfig(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moduleWheelConfigForm,
    input: raw,
    guard: noGuard,
    handler: async (c) => {
      const profile = await requireAdminProfileLive()
      // Client UTILISATEUR : `training_module_wheel_config_admin_write` autorise l'admin — la RLS
      // fait le travail, défense en profondeur gratuite.
      const supabase = await createClient()
      const { error } = await supabase.from('training_module_wheel_config').upsert({
        id: 1,
        title: c.title,
        segments: segmentsToJson(c.segments.map((s) => ({ label: s.label, weight: s.weight, amountEur: s.amountEur }))),
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidatePath('/formation/ma-roue')
    },
  })
}
