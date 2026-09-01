'use server'

import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { addDays, parseChatterList, parseNotes, parseTodo } from '@/lib/tracker/parse'
import { TrackerAuthError, trackerGet, trackerLogin } from '@/lib/tracker/scrape'
import { revalidateTodo } from '@/lib/tracking/todo-guards'

/**
 * « Récupérer mon historique du tracker » — l'encadrant connecté saisit SES identifiants du tracker,
 * on se connecte comme lui, et on ramène SES to-do + le suivi de SES chatteurs, rangé sous SON profil.
 *
 * L'ASSOCIATION est réglée par l'authentification, exactement comme la reprise Formation : c'est lui
 * qui se connecte des deux côtés, donc on sait sans deviner que le compte tracker = ce profil-ci.
 * Le seul rapprochement qui reste par NOM est le chatteur SUJET d'un suivi (il n'a pas de compte).
 *
 * Idempotent : relancer ne duplique pas (dédup sur des clés naturelles). Écriture service-role après
 * garde — les tables `tracker_*` n'ont aucune policy d'écriture, comme le reste de la feature.
 */

// Semaines réellement remplies dans le tracker (relevées en reconnaissance). Élargir si besoin.
const WEEKS = ['2026-08-17', '2026-08-24', '2026-08-31']

const input = z.object({
  trackerUser: z.string().trim().min(1, 'Identifiant requis').max(60),
  trackerPass: z.string().min(1, 'Mot de passe requis').max(200),
})

const norm = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export interface ImportResult {
  tasksAdded: number
  sessionsAdded: number
  notesAdded: number
  /** Chatteurs du tracker sans profil correspondant chez nous — leur suivi n'a pas été importé. */
  unmatchedChatters: string[]
}

export async function importFromTracker(raw: unknown): Promise<ActionResult<ImportResult>> {
  return runAction({
    schema: input,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<ImportResult> => {
      // Le profil connecté EST le propriétaire de l'import. `Live` refuse la consultation « en tant
      // que » : on ne récupère pas l'historique de quelqu'un sous son identité.
      const me = await requirePageProfileLive('presence')
      const admin = createAdminClient()

      let cookie: string
      try {
        cookie = await trackerLogin(d.trackerUser, d.trackerPass)
      } catch (err) {
        if (err instanceof TrackerAuthError) throw new BusinessError(err.message)
        Sentry.captureException(err)
        throw new Error('Le tracker est injoignable pour le moment — réessaie dans un instant.')
      }

      // ─────────────── TO-DO : mes tâches, rangées sous mon profil
      // Dédup : on charge d'abord ce qui existe déjà chez moi sur ces semaines, et on ne réinsère
      // pas une tâche identique (même jour, même section, même intitulé).
      // La borne HAUTE est le DIMANCHE de la dernière semaine (lundi + 6), pas le lundi : sinon les
      // jours de fin de semaine (souvent en septembre) tombent hors de la fenêtre de dédup et se
      // réinséraient à chaque relance — le contraire de « relancer sans risque ».
      const weekEnd = addDays(WEEKS[WEEKS.length - 1], 6)
      const { data: existing } = await admin
        .from('tracker_todo_tasks')
        .select('date, category, label')
        .eq('owner_id', me.id)
        .gte('date', WEEKS[0])
        .lte('date', weekEnd)
      const seen = new Set((existing ?? []).map((t) => `${t.date}|${norm(t.category)}|${norm(t.label)}`))

      const toInsert: { owner_id: string; date: string; category: string; label: string; done: boolean; done_at: string | null; position: number; created_by: string }[] = []
      for (const wk of WEEKS) {
        const { tasks } = parseTodo(await trackerGet(cookie, `/todo?semaine=${wk}&compte=`), wk)
        // `compte=` (vide) sert le compte CONNECTÉ : c'est bien MA semaine. La récurrence est
        // aplatie en tâche ordinaire — on garde le contenu et l'état coché, pas le gabarit invisible.
        tasks.forEach((t, i) => {
          const key = `${t.date}|${norm(t.section)}|${norm(t.label)}`
          if (seen.has(key)) return
          seen.add(key)
          toInsert.push({
            owner_id: me.id,
            date: t.date,
            category: t.section || 'Général',
            label: t.label,
            done: t.done,
            done_at: t.done ? new Date(`${t.date}T12:00:00Z`).toISOString() : null,
            position: i,
            created_by: me.id,
          })
        })
      }
      if (toInsert.length) {
        const { error } = await admin.from('tracker_todo_tasks').insert(toInsert)
        if (error) throw new Error(error.message)
      }

      // ─────────────── SUIVI : les fiches de MES chatteurs (le tracker les borne à mon périmètre)
      const chatters = parseChatterList(await trackerGet(cookie, '/notes'))

      // Rapprochement par nom (le chatteur n'a pas de compte). Collision de noms normalisés →
      // NON rapproché : mieux vaut le signaler que d'attribuer un suivi au mauvais profil.
      const { data: profs } = await admin.from('profiles').select('id, display_name').eq('role', 'chatteur').is('left_at', null)
      const byName = new Map<string, string | null>()
      for (const p of profs ?? []) {
        const k = norm(p.display_name)
        byName.set(k, byName.has(k) ? null : p.id) // 2e occurrence → null (ambigu)
      }

      const { data: skillRows } = await admin.from('tracker_skills').select('id, name')
      const skillByName = new Map((skillRows ?? []).map((s) => [norm(s.name), s.id]))

      let sessionsAdded = 0
      let notesAdded = 0
      const unmatched: string[] = []

      for (const c of chatters) {
        const profileId = byName.get(norm(c.name))
        if (!profileId) {
          // Absent (undefined) OU ambigu (null, plusieurs profils du même nom) : on ne devine
          // jamais à quel profil rattacher un suivi, et on le SIGNALE dans les deux cas — sans quoi
          // les homonymes disparaissaient sans trace.
          unmatched.push(c.name)
          continue
        }
        const { sessions, generalNote } = parseNotes(await trackerGet(cookie, `/notes/${c.id}`))

        for (const s of sessions) {
          if (!s.date) continue
          // Dédup session : (chatteur, date, compte-rendu). Une session sans écart notable ne se
          // réimporte pas deux fois.
          const { data: dup } = await admin
            .from('tracker_sessions')
            .select('id')
            .eq('chatter_id', profileId)
            .eq('date', s.date)
            .eq('summary', s.summary)
            .maybeSingle()
          if (dup) continue

          const { data: session, error: sErr } = await admin
            .from('tracker_sessions')
            .insert({ chatter_id: profileId, author_id: me.id, date: s.date, score: s.score, summary: s.summary, general: '' })
            .select('id')
            .single()
          if (sErr) throw new Error(sErr.message)
          sessionsAdded++

          const ratings = s.ratings
            .map((r) => ({ skill_id: r.skill ? skillByName.get(norm(r.skill)) : undefined, stars: r.stars, comment: r.comment }))
            .filter((r) => r.skill_id && r.stars >= 1 && r.stars <= 5)
          if (ratings.length) {
            const { error: rErr } = await admin.from('tracker_ratings').insert(
              ratings.map((r) => ({ chatter_id: profileId, skill_id: r.skill_id as string, session_id: session.id, stars: r.stars, comment: r.comment, author_id: me.id })),
            )
            if (rErr) throw new Error(rErr.message)
          }
        }

        if (generalNote) {
          const { data: dupNote } = await admin
            .from('tracker_chatter_notes')
            .select('id')
            .eq('chatter_id', profileId)
            .eq('body', generalNote)
            .maybeSingle()
          if (!dupNote) {
            const { error: nErr } = await admin.from('tracker_chatter_notes').insert({ chatter_id: profileId, author_id: me.id, body: generalNote })
            if (nErr) throw new Error(nErr.message)
            notesAdded++
          }
        }
      }

      revalidateTodo()
      revalidatePath('/chatter/presence/suivi')
      return { tasksAdded: toInsert.length, sessionsAdded, notesAdded, unmatchedChatters: unmatched }
    },
  })
}
