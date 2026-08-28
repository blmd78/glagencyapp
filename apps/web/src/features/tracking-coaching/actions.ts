'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { getProfile, hasWriteAccess } from '@/lib/auth'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
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
 *
 * ET SUR QUI : le PÉRIMÈTRE MODÈLES est revalidé à CHAQUE écriture, jamais seulement à l'affichage.
 * C'est la règle du tracker d'origine, dont le commentaire la justifie mot pour mot — « Chaque
 * appel remonte au chatter concerné et revalide le périmètre : masquer un chatter dans l'interface
 * ne suffit pas » (décorateur `notesApi`, routes.js.txt:144-157). Sans ça, un appel forgé notait ou
 * supprimait la fiche de n'importe quel chatteur de l'agence — exactement l'incident de l'audit
 * Police du 2026-08-06, qui avait donné `isChatterInScope`.
 *
 * Les mutations qui ne portent qu'un `sessionId`/`noteId` remontent d'ABORD au chatteur propriétaire
 * (les résolveurs `bySession`/`byNote` du legacy) : « introuvable » avant « non autorisé », comme eux.
 */

const LIST = '/chatter/presence/suivi'

async function requireCoach(): Promise<{ id: string; role: string }> {
  const profile = await getProfile()
  if (!profile) throw new BusinessError('Session expirée.')
  // `hasWriteAccess` et non un simple `pages.includes` : il EXCLUT le chatteur, qui peut porter la
  // page en lecture. Miroir applicatif de `can_write_page()` (0060), utilisé partout ailleurs.
  if (!hasWriteAccess(profile, 'presence')) {
    throw new BusinessError("Tu n'as pas le droit d'écrire dans le suivi des chatters.")
  }
  return { id: profile.id, role: profile.baseRole }
}

/**
 * Garde complète d'une écriture : le droit de page PUIS le périmètre modèles sur le chatteur visé.
 * Équivalent du décorateur `notesApi` du tracker d'origine (routes.js.txt:144-157).
 */
async function requireCoachFor(chatterId: string): Promise<string> {
  const caller = await requireCoach()
  // Ordre du legacy : « introuvable » (404) AVANT « non autorisé » (403).
  await assertIsChatter(chatterId)
  const scope = await getCreatorScope(caller.id, caller.role)
  if (!(await isChatterInScope(scope, chatterId))) {
    // Le libellé du legacy, au présent : le cas visé est une réassignation de modèles entre
    // l'affichage et l'écriture (routes.js.txt:331).
    throw new BusinessError("Ce chatter n'est plus dans ton périmètre.")
  }
  return caller.id
}

/**
 * La cible est-elle bien un CHATTEUR ? Portage du résolveur `chatterExists` du legacy
 * (routes.js.txt:157), qui répond « introuvable » (404) avant tout contrôle de périmètre.
 *
 * Sans lui, le seul test était le recoupement `profile_creators` : un encadrant pouvait donc se
 * noter LUI-MÊME, ou noter un pair partageant une de ses modèles — exactement ce que l'en-tête de
 * ce fichier interdit (« on note quelqu'un, on ne se note pas soi-même »).
 */
async function assertIsChatter(chatterId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles').select('role').eq('id', chatterId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError('Chatter introuvable.')
  if (data.role !== 'chatteur') throw new BusinessError("Ce profil n'est pas un chatter.")
}

/** Chatteur propriétaire d'une session — « introuvable » AVANT tout contrôle de périmètre (legacy). */
async function sessionOwner(sessionId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracker_sessions').select('chatter_id').eq('id', sessionId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError('Session introuvable.')
  return data.chatter_id
}

/** Chatteur propriétaire d'une note libre — même ordre que `sessionOwner`. */
async function noteOwner(noteId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracker_chatter_notes').select('chatter_id').eq('id', noteId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError('Note introuvable.')
  return data.chatter_id
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
      const authorId = await requireCoachFor(d.chatterId)
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
      const authorId = await requireCoachFor(d.chatterId)
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
            // Le « Pourquoi cette note ? » saisi en face de l'étoile — il était perdu (`comment: ''`
            // en dur côté composant) alors que l'historique sait l'afficher.
            comment: r.comment,
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
      await requireCoachFor(await sessionOwner(d.sessionId))
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
      await requireCoachFor(await sessionOwner(d.sessionId))
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
      const authorId = await requireCoachFor(d.chatterId)
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
      await requireCoachFor(await noteOwner(d.noteId))
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
      await requireCoachFor(await noteOwner(d.noteId))
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
