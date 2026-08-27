'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { getProfile } from '@/lib/auth'
import {
  addNoteInput, archiveSkillInput, deleteNoteInput, deleteSessionInput, rateInput,
  sessionInput, skillInput, updateNoteInput, updateSessionInput,
} from './schema'

/**
 * Mutations du suivi chatters.
 *
 * ÉCRITURES EN SERVICE-ROLE APRÈS GARDE : la migration 0128 ne pose aucune politique d'écriture,
 * il n'existe donc qu'un seul chemin, celui-ci. Même patron que la face Formation.
 *
 * QUI PEUT ÉCRIRE : les porteurs de la page `presence` et les admins — pas le chatteur sur son
 * propre suivi. On note quelqu'un, on ne se note pas soi-même.
 */

const LIST = '/chatter/presence/suivi'

async function requireCoach(): Promise<string> {
  const profile = await getProfile()
  if (!profile) throw new BusinessError('Session expirée.')
  if (profile.role !== 'admin' && !profile.pages.includes('presence')) {
    throw new BusinessError("Tu n'as pas accès au suivi des chatters.")
  }
  return profile.id
}

const touch = (chatterId?: string): void => {
  revalidatePath(LIST)
  if (chatterId) revalidatePath(`${LIST}/${chatterId}`)
}

/** Note une compétence. N'ÉCRASE JAMAIS : chaque note s'ajoute à l'historique. */
export async function rateSkill(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: rateInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const authorId = await requireCoach()
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_ratings').insert({
        chatter_id: d.chatterId,
        skill_id: d.skillId,
        session_id: d.sessionId,
        stars: d.stars,
        comment: d.comment,
        author_id: authorId,
      })
      if (error) throw new Error(error.message)
      touch(d.chatterId)
    },
  })
}

/** Enregistre une session 1:1 ET ses notes de compétences, d'un seul geste. */
export async function saveSession(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sessionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const authorId = await requireCoach()
      const admin = createAdminClient()
      const { data: session, error } = await admin
        .from('tracker_sessions')
        .insert({
          chatter_id: d.chatterId,
          author_id: authorId,
          date: d.date,
          score: d.score,
          summary: d.summary,
          general: d.general,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      if (d.ratings.length > 0) {
        const { error: rErr } = await admin.from('tracker_ratings').insert(
          d.ratings.map((r) => ({
            chatter_id: d.chatterId,
            skill_id: r.skillId,
            session_id: session.id,
            stars: r.stars,
            author_id: authorId,
          })),
        )
        // La session est déjà écrite : on la retire plutôt que de laisser une session vide
        // derrière soi, ce qui fausserait la moyenne affichée en tête de fiche.
        if (rErr) {
          await admin.from('tracker_sessions').delete().eq('id', session.id)
          throw new Error(rErr.message)
        }
      }
      touch(d.chatterId)
    },
  })
}

export async function updateSession(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateSessionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await requireCoach()
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('tracker_sessions')
        .update({ score: d.score, summary: d.summary, general: d.general })
        .eq('id', d.sessionId)
        .select('chatter_id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      touch(data?.chatter_id)
    },
  })
}

export async function deleteSession(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteSessionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await requireCoach()
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('tracker_sessions').delete().eq('id', d.sessionId).select('chatter_id').maybeSingle()
      if (error) throw new Error(error.message)
      touch(data?.chatter_id)
    },
  })
}

export async function addNote(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: addNoteInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const authorId = await requireCoach()
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_chatter_notes')
        .insert({ chatter_id: d.chatterId, author_id: authorId, body: d.body })
      if (error) throw new Error(error.message)
      touch(d.chatterId)
    },
  })
}

export async function updateNote(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateNoteInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await requireCoach()
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('tracker_chatter_notes')
        .update({ body: d.body, updated_at: new Date().toISOString() })
        .eq('id', d.noteId)
        .select('chatter_id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      touch(data?.chatter_id)
    },
  })
}

export async function deleteNote(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteNoteInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await requireCoach()
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('tracker_chatter_notes').delete().eq('id', d.noteId).select('chatter_id').maybeSingle()
      if (error) throw new Error(error.message)
      touch(data?.chatter_id)
    },
  })
}

/** Crée ou renomme une compétence de la grille. Admin seulement : c'est un référentiel partagé. */
export async function saveSkill(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: skillInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const profile = await getProfile()
      if (profile?.role !== 'admin') throw new BusinessError('Réservé aux administrateurs.')
      const admin = createAdminClient()
      const res = d.skillId
        ? await admin.from('tracker_skills')
            .update({ name: d.name, description: d.description }).eq('id', d.skillId)
        : await admin.from('tracker_skills').insert({ name: d.name, description: d.description })
      if (res.error) throw new Error(res.error.message)
      revalidatePath(LIST)
    },
  })
}

/**
 * Retire une compétence de la grille. On DÉSACTIVE au lieu de supprimer : une suppression
 * emporterait tout l'historique des notes qui y pointent, et ce sont des évaluations de personnes.
 */
export async function archiveSkill(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: archiveSkillInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const profile = await getProfile()
      if (profile?.role !== 'admin') throw new BusinessError('Réservé aux administrateurs.')
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_skills').update({ active: false }).eq('id', d.skillId)
      if (error) throw new Error(error.message)
      revalidatePath(LIST)
    },
  })
}
