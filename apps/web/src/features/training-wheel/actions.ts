'use server'

// Roue des récompenses — lancer un tirage pour un chatteur, configurer la roue (admin).
//
// Règle du 2026-08-24 : le tour n'est plus GAGNÉ (top 3 hebdo, trophée) mais DONNÉ — l'encadrant
// ouvre la roue en partage d'écran, choisit un chatteur et lance pour lui. Il n'y a donc plus ni
// ticket ni file d'attente, et plus aucune limite au nombre de tours : le garde-fou est la
// traçabilité (`training_wheel_spins.spun_by`, 0121), lisible dans l'historique.
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (aucune policy d'écriture
// `authenticated` sur les spins) — TOUJOURS après avoir vérifié le droit ET que la cible est bien
// un chatteur en formation. Seule la config admin s'écrit sous RLS
// (`training_wheel_config_admin_write`).
//
// Le TIRAGE est décidé ici (crypto.randomInt) : le client ne fait qu'animer jusqu'au secteur rendu.
//
// Gardes : `requirePageProfileLive('frm-suivi')` pour le tirage, `requireAdminProfileLive()` pour
// la config — les deux refusent la consultation « en tant que » (une impersonation ne verse jamais
// d'argent).

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { mondayOf, pickWeighted, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { prizesToJson, toPrizes, toSectors } from './mappers'
import { spinInput, wheelConfigForm } from './schema'
import type { SpinResult } from './types'

/** La page Roue affiche l'historique et « Mes gains » : les deux bougent quand la config change. */
const revalidateWheel = () => revalidatePath('/formation/roue')

/**
 * Le tirage — décidé ICI (crypto), enregistré au nom du CHATTEUR, tracé au nom de l'encadrant.
 *
 * Règle du 2026-08-24 : un tour n'est plus gagné (top 3, trophée) mais DONNÉ. L'encadrant ouvre la
 * roue en partage d'écran, choisit un chatteur et lance pour lui. Il n'y a donc plus de ticket à
 * consommer — et plus aucune limite au nombre de tours : le garde-fou est la traçabilité
 * (`spun_by`), visible dans l'historique.
 *
 * DEUX vérifications avant d'écrire, parce que ce geste verse de l'argent :
 *  1. l'appelant a le droit d'encadrement (`frm-suivi`) — `requirePageProfileLive` couvre aussi
 *     l'admin et refuse une consultation « en tant que » ;
 *  2. la cible est bien un chatteur EN FORMATION, ET n'est pas l'appelant. Sans le premier
 *     contrôle, un `forProfileId` forgé créerait un gain au nom de n'importe quel membre ; sans le
 *     second, un chatteur à qui on donnerait le droit Suivi (rien ne l'interdit) se retrouverait
 *     dans sa propre liste de cibles et pourrait se payer en boucle.
 */
export async function spinWheel(raw: unknown): Promise<ActionResult<SpinResult>> {
  return runAction({
    schema: spinInput,
    input: raw,
    guard: noGuard,
    handler: async ({ forProfileId }): Promise<SpinResult> => {
      const profile = await requirePageProfileLive('frm-suivi')
      const supabase = await createClient()
      const [cibleRes, cfgRes] = await Promise.all([
        // La RPC porte la MÊME garde `has_page('frm-suivi')` et ne renvoie que les chatteurs en
        // formation : si la cible n'y est pas, elle n'a rien à faire dans un tirage.
        supabase.rpc('training_overview_roster'),
        supabase.from('training_wheel_config').select('sectors, prizes').eq('id', 1).single(),
      ])
      if (cibleRes.error) throw new Error(cibleRes.error.message)
      if (cfgRes.error) throw new Error(cfgRes.error.message)
      // Personne ne se verse un gain à soi-même, quel que soit son cumul de droits.
      if (forProfileId === profile.id) throw new BusinessError('Tu ne peux pas lancer la roue pour toi-même')
      const cible = (cibleRes.data ?? []).find((r) => r.profile_id === forProfileId)
      if (!cible) throw new BusinessError('Ce membre ne fait pas partie de la formation')

      const sectors = toSectors(cfgRes.data.sectors)
      const prizes = toPrizes(cfgRes.data.prizes)
      const sec = pickWeighted(sectors, (n) => randomInt(0, n))
      const won = !sec.item.lose
      const prize = won ? pickWeighted(prizes, (n) => randomInt(0, n)) : null

      // Service-role APRÈS la garde applicative ci-dessus (patron de toute la face Formation) : la
      // RLS d'écriture de `training_wheel_spins` est fermée, c'est le code qui autorise.
      const { error: sErr } = await createAdminClient().from('training_wheel_spins').insert({
        profile_id: forProfileId,
        // Plus de ticket consommé (0121) ; `week` = semaine du TIRAGE, elle sert au regroupement
        // comptable de l'historique.
        ticket_id: null,
        spun_by: profile.id,
        week: mondayOf(todayParis()),
        sector_label: sec.item.label,
        won,
        prize_label: prize ? prize.item.label : null,
        // `check (won or amount_eur is null)` : un Raté ne porte JAMAIS de montant.
        amount_eur: won && prize ? prize.item.amountEur : null,
      })
      if (sErr) throw new Error(sErr.message)

      // PAS de `revalidateWheel()` ici, volontairement. Une Server Action qui revalide renvoie le
      // RSC payload rafraîchi AVEC sa réponse : l'historique afficherait le lot et son montant
      // avant même que la roue ait tourné — le coffre à ouvrir ne révélerait plus rien. Le
      // rafraîchissement se fait côté client, à la fermeture de la révélation.
      return {
        sectorIndex: sec.index,
        sectorLabel: sec.item.label,
        won,
        prize: prize ? { index: prize.index, label: prize.item.label, amountEur: prize.item.amountEur } : null,
      }
    },
  })
}

/** Config admin — la ligne 1 est seedée par 0122, donc c'est toujours un update de fait. */
export async function saveWheelConfig(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: wheelConfigForm,
    input: raw,
    guard: noGuard,
    handler: async (c) => {
      const profile = await requireAdminProfileLive()
      // Client UTILISATEUR : `training_wheel_config_admin_write` autorise l'admin — pas besoin du
      // service-role ici, la RLS fait le travail (défense en profondeur gratuite).
      const supabase = await createClient()
      const { error } = await supabase.from('training_wheel_config').upsert({
        id: 1,
        title: c.title,
        sectors: c.sectors,
        prizes: prizesToJson(c.prizes),
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidateWheel()
    },
  })
}
