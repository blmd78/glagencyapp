'use server'

// Roue des récompenses — réclamer son tour, le jouer, configurer la roue (admin).
//
// LECTURES avec le client utilisateur (RLS) ; ÉCRITURES en service-role (0122 : aucune policy
// d'écriture `authenticated` sur tickets/spins) — TOUJOURS après avoir vérifié le droit ET la
// propriété du ticket avec le client utilisateur. Seule la config admin s'écrit sous RLS
// (`training_wheel_config_admin_write`).
//
// Le TIRAGE est décidé ici (crypto.randomInt) : le client ne fait qu'animer jusqu'au secteur rendu.
//
// Gardes : `requirePageProfileLive('frm-entrainement')` pour le joueur, `requireAdminProfileLive()`
// pour la config — les deux refusent la consultation « en tant que » (une impersonation ne réclame
// ni ne joue jamais de l'argent).

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  lastCompletedWeek,
  pickWeighted,
  todayParis,
  wheelWeekLabel,
  WHEEL_TOP_N,
} from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { prizesToJson, toPrizes, toSectors } from './mappers'
import { spinInput, wheelConfigForm } from './schema'
import type { SpinResult } from './types'

const ALREADY_USED = 'Ce tour a déjà été utilisé'

/**
 * La pastille de la sidebar est rendue par `app/(dash)/layout.tsx` : le second chemin invalide la
 * CHAÎNE DE LAYOUTS du sous-arbre `/formation` (mode `'layout'`), sans quoi le compteur resterait
 * figé après un tour joué.
 */
const revalidateWheel = () => {
  revalidatePath('/formation/roue')
  revalidatePath('/formation', 'layout')
}

/**
 * Réclame le ticket de la semaine passée si le chatter y était top 3 (revérifié SERVEUR via la RPC
 * `training_weekly_ranking` — la pastille de la sidebar n'est qu'un indice).
 * Idempotent : ticket non utilisé déjà là → on le rend ; déjà attribué pour cette semaine, ou pas
 * classé → `null` (le client retombe simplement sur « pas de tour »).
 */
export async function claimTicket(): Promise<ActionResult<{ ticketId: string | null }>> {
  return runAction({
    schema: z.object({}),
    input: {},
    guard: noGuard,
    handler: async (): Promise<{ ticketId: string | null }> => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const supabase = await createClient()
      const week = lastCompletedWeek(todayParis())

      const { data: pending, error: pErr } = await supabase
        .from('training_wheel_tickets')
        .select('id')
        .eq('profile_id', profile.id)
        .is('used_at', null)
        .limit(1)
      if (pErr) throw new Error(pErr.message)
      const already = pending[0]
      if (already) return { ticketId: already.id }

      const { data: rows, error } = await supabase.rpc('training_weekly_ranking', { p_week: week })
      if (error) throw new Error(error.message)
      const ranking = rows ?? []
      const rank = ranking.findIndex((r) => r.profile_id === profile.id)
      const me = rank >= 0 ? ranking[rank] : undefined
      // Hors top 3, ou 0 point : rien à réclamer. `Number()` — `points` est un integer SQL mais
      // supabase-js rend les numériques en chaîne selon la version.
      if (!me || rank >= WHEEL_TOP_N || Number(me.points) <= 0) return { ticketId: null }

      const { data: t, error: iErr } = await createAdminClient()
        .from('training_wheel_tickets')
        .insert({ profile_id: profile.id, week, reason: `Top ${rank + 1} — ${wheelWeekLabel(week)}` })
        .select('id')
        .single()
      if (iErr?.code === '23505') {
        // 23505 : soit `unique (profile_id, week)` (déjà attribué et joué), soit l'index unique
        // « un seul ticket non utilisé » de 0123 (course avec un autre onglet — celui qui perd
        // l'insert re-sélectionne le ticket que l'autre onglet vient de créer). Le client se
        // rafraîchit dès qu'il reçoit un id de ticket ; `null` seulement si vraiment déjà joué.
        const { data: race, error: rErr } = await supabase
          .from('training_wheel_tickets')
          .select('id')
          .eq('profile_id', profile.id)
          .is('used_at', null)
          .limit(1)
        if (rErr) throw new Error(rErr.message)
        return { ticketId: race[0]?.id ?? null }
      }
      if (iErr) throw new Error(iErr.message)

      revalidateWheel()
      return { ticketId: t.id }
    },
  })
}

/** Le tirage : décidé ICI (crypto), consomme le ticket, enregistre le tour. */
export async function spinWheel(raw: unknown): Promise<ActionResult<SpinResult>> {
  return runAction({
    schema: spinInput,
    input: raw,
    guard: noGuard,
    handler: async ({ ticketId }): Promise<SpinResult> => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const supabase = await createClient()
      const [ticketRes, cfgRes] = await Promise.all([
        supabase.from('training_wheel_tickets').select('id, profile_id, week, used_at').eq('id', ticketId).maybeSingle(),
        supabase.from('training_wheel_config').select('sectors, prizes').eq('id', 1).single(),
      ])
      if (ticketRes.error) throw new Error(ticketRes.error.message)
      if (cfgRes.error) throw new Error(cfgRes.error.message)
      const t = ticketRes.data
      // La RLS ne montre au chatter que SES tickets, mais un encadrant `frm-suivi` voit ceux des
      // autres : la vérification de propriété est explicite, et c'est ELLE qui autorise les
      // écritures service-role qui suivent.
      if (!t || t.profile_id !== profile.id) throw new BusinessError('Ticket introuvable')
      if (t.used_at) throw new BusinessError(ALREADY_USED)

      const sectors = toSectors(cfgRes.data.sectors)
      const prizes = toPrizes(cfgRes.data.prizes)
      const sec = pickWeighted(sectors, (n) => randomInt(0, n))
      const won = !sec.item.lose
      const prize = won ? pickWeighted(prizes, (n) => randomInt(0, n)) : null

      const admin = createAdminClient()
      // Consommation ATOMIQUE : `.is('used_at', null)` + select → 0 ligne = double clic / course
      // perdue, le tour a déjà été joué ailleurs. À faire AVANT d'insérer le tirage (`ticket_id`
      // est unique sur `training_wheel_spins`, mais mieux vaut ne rien écrire du tout).
      const { data: used, error: uErr } = await admin
        .from('training_wheel_tickets')
        .update({ used_at: new Date().toISOString() })
        .eq('id', t.id)
        .is('used_at', null)
        .select('id')
      if (uErr) throw new Error(uErr.message)
      if (!used.length) throw new BusinessError(ALREADY_USED)

      const { error: sErr } = await admin.from('training_wheel_spins').insert({
        profile_id: profile.id,
        ticket_id: t.id,
        week: t.week,
        sector_label: sec.item.label,
        won,
        prize_label: prize ? prize.item.label : null,
        // `check (won or amount_eur is null)` (0123) : un Raté ne porte JAMAIS de montant.
        amount_eur: won && prize ? prize.item.amountEur : null,
      })
      if (sErr) {
        // COMPENSATION : un ticket ne doit jamais être brûlé sans tirage enregistré. L'insert et
        // l'update ne sont pas dans la même transaction (deux appels PostgREST) — si le tirage
        // échoue, on rend le ticket pour que le chatter puisse rejouer. L'échec de la compensation
        // n'est que journalisé : il ne doit JAMAIS masquer l'erreur d'origine (celle qui part en
        // Sentry via `runAction`).
        const { error: cErr } = await admin.from('training_wheel_tickets').update({ used_at: null }).eq('id', t.id)
        if (cErr) console.error('[roue] ticket non rendu après échec du tirage', t.id, cErr.message)
        throw new Error(sErr.message)
      }

      revalidateWheel()
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
