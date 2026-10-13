'use server'

import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import { assertCanOrganize, revalidateTodo } from './actions-shared'
import { DAY_TASK_CATEGORY } from './day-category'
import { dedupKey, parseTodoFile, periodsOverlap, widenedPeriod, type HabitPeriod } from './import-txt'
import { STEP } from './order'
import { importTxtInput } from './schema'

/**
 * IMPORTER UN FICHIER `.txt` DANS LA TO-DO D'UNE PERSONNE (#163).
 *
 * Usage (Benoit, 2026-10-12) : un admin remplit la to-do d'un manager à partir du plan qu'il a
 * préparé. Garde-fou demandé : « s'assurer qu'ils ont bien sélectionné un mec » — l'import vise la
 * personne CHOISIE dans le sélecteur, jamais « Ma semaine » ; refusé ici aussi, l'écran n'étant
 * qu'optimiste. Déposer des tâches chez quelqu'un, c'est ORGANISER sa semaine : `assertCanOrganize`.
 *
 * Ce que l'import écrit :
 * • la ROUTINE — une habitude quotidienne par ligne, due du 1er au dernier jour du fichier
 *   (`starts_on`, 0194 ; `ends_on`, 0196 — « pas que sur 20 jours », Benoit, 2026-10-12), dans la
 *   section du fichier (« Routine ») ; déposée par l'importeur, donc verrouillée pour son titulaire
 *   (règle 0148, décision du 2026-10-12) ;
 * • les tâches de chaque jour, dans la section de leur groupe (« À faire » sans titre), dans l'ordre
 *   du fichier, en urgence Normale — Urgente pour un groupe « Urgences ».
 *
 * Relancer le même fichier n'ajoute rien : une tâche est reconnue à (jour, section, titre), une
 * habitude à (section, titre) sur une période qui recoupe celle du fichier — le fichier du mois
 * suivant crée donc sa propre routine. Un fichier qui a la moindre erreur n'écrit RIEN — la lecture
 * est entière avant la première écriture. Écritures en service-role, comme toute la to-do (0127).
 */

export interface ImportTxtResult {
  tasksAdded: number
  tasksSkipped: number
  habitsAdded: number
  habitsSkipped: number
}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

/** Rang des sections d'un fichier : après les sections existantes (0 par défaut), avant « À faire » (999). */
const GROUP_BASE = 100

export async function importTodoFile(raw: unknown): Promise<ActionResult<ImportTxtResult>> {
  return runAction({
    schema: importTxtInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<ImportTxtResult> => {
      const caller = await assertCanOrganize(d.ownerId)
      if (caller.id === d.ownerId) {
        throw new BusinessError('Choisis d’abord, dans le sélecteur, la personne dont tu remplis la to-do.')
      }

      const parsed = parseTodoFile(d.text)
      const first = parsed.errors[0]
      if (first) throw new BusinessError(`Fichier refusé, ligne ${first.line} : ${first.message}`)
      const period = parsed.period
      if (!period) throw new BusinessError('Fichier refusé : période illisible.')
      const dayCount = parsed.days.reduce((n, x) => n + x.tasks.length, 0)
      if (dayCount === 0 && parsed.routine.length === 0) throw new BusinessError('Aucune tâche à importer dans ce fichier.')

      const admin = createAdminClient()
      const result: ImportTxtResult = { tasksAdded: 0, tasksSkipped: 0, habitsAdded: 0, habitsSkipped: 0 }

      // ─────────────── SECTIONS : la routine puis les groupes, dans l'ordre du fichier
      // Une habitude ouvre sa section les jours où elle est due, un titre de groupe les jours où il
      // a des tâches (`get-week.ts`) : aucune n'a besoin de revenir d'elle-même. Elles sont donc
      // enregistrées PONCTUELLES (aucun jour), seulement pour leur rang — sans section enregistrée,
      // la grille les rangerait par ordre alphabétique (« Chérif et outils » avant « Urgences »).
      // Une section « Routine » RÉCURRENTE ouvrait sa case vide chaque jour après la période.
      // Après les sections existantes, avant « À faire » ; une section du même nom est laissée telle
      // quelle.
      const routineSection = parsed.routine.length > 0 ? parsed.routineSection : null
      const groups = [
        ...new Set([
          ...(routineSection ? [routineSection] : []),
          ...parsed.days.flatMap((x) => x.tasks.map((t) => t.category)),
        ]),
      ].filter((name) => name !== DAY_TASK_CATEGORY)
      if (groups.length > 0) {
        const { data: sections, error: sErr } = await admin
          .from('tracker_todo_sections').select('name, position').eq('owner_id', d.ownerId)
        if (sErr) throw new Error(sErr.message)
        const known = new Set((sections ?? []).map((x) => x.name))
        // À la suite des groupes déjà enregistrés (un import précédent) : repartir de `GROUP_BASE`
        // à chaque fichier mettrait les nouveaux groupes à égalité avec les anciens, départagés par
        // l'alphabet.
        const base = Math.max(GROUP_BASE, ...(sections ?? []).map((x) => x.position + 1))
        const missing = groups
          .filter((name) => !known.has(name))
          .map((name, i) => ({ owner_id: d.ownerId, name, weekdays: '', position: base + i }))
        if (missing.length > 0) {
          const { error } = await admin
            .from('tracker_todo_sections')
            .upsert(missing, { onConflict: 'owner_id,name', ignoreDuplicates: true })
          if (error) throw new Error(error.message)
        }
      }

      // ─────────────── ROUTINE : une habitude par ligne, sur la période du fichier
      if (routineSection) {
        const section = routineSection
        const { data: habits, error: hErr } = await admin
          .from('tracker_todo_habits').select('id, category, label, position, starts_on, ends_on').eq('owner_id', d.ownerId)
        if (hErr) throw new Error(hErr.message)
        // Déjà là = même section, même titre, et une période qui recoupe celle du fichier
        // (`periodsOverlap`) : elle s'étend alors au fichier (`widenedPeriod`). La routine d'octobre
        // ne bloque pas celle de novembre.
        const known = new Map<string, { id: string } & HabitPeriod>()
        for (const h of habits ?? []) {
          const k = dedupKey(h.label)
          if (h.category === section && periodsOverlap(h, period) && !known.has(k)) known.set(k, h)
        }
        const widen: ({ id: string } & HabitPeriod)[] = []
        // Rangées APRÈS les habitudes existantes, dans l'ordre du fichier : un seul `insert` donne la
        // même `created_at` à toutes, seul `position` peut les départager (rang, #161).
        const start = Math.max(-1, ...(habits ?? []).map((h) => h.position)) + 1
        const rows = parsed.routine
          .filter((t) => {
            const h = known.get(dedupKey(t.label))
            if (!h) return true
            result.habitsSkipped++
            const p = widenedPeriod(h, period)
            if (p) widen.push({ id: h.id, ...p })
            return false
          })
          .map((t, i) => ({
            owner_id: d.ownerId,
            category: section,
            label: t.label,
            description: t.description,
            urgency: 'normale',
            weekdays: EVERY_DAY.join(','),
            starts_on: period.from,
            ends_on: period.to,
            position: start + i,
            created_by: caller.id,
          }))
        if (rows.length > 0) {
          const { error } = await admin.from('tracker_todo_habits').insert(rows)
          // Une habitude créée au même instant a pris l'une de ces positions (index unique, 0193) :
          // aucune habitude ni tâche n'est écrite (les sections, déjà posées, ne se doubleront pas) —
          // relancer suffit.
          if (error?.code === '23505') {
            throw new BusinessError('Une habitude vient d’être créée en même temps : relance l’import.')
          }
          if (error) throw new Error(error.message)
        }
        for (const { id, ...p } of widen) {
          const { error } = await admin.from('tracker_todo_habits').update(p).eq('id', id).eq('owner_id', d.ownerId)
          if (error) throw new Error(error.message)
        }
        result.habitsAdded = rows.length
      }

      // ─────────────── TÂCHES DU JOUR : dans leur groupe, à la suite de ce qui y est déjà
      const { data: existing, error: exErr } = await admin
        .from('tracker_todo_tasks')
        .select('date, category, label, position')
        .eq('owner_id', d.ownerId)
        // Une occurrence sautée (0195) n'est plus à l'écran : elle ne compte pas comme « déjà là ».
        .eq('skipped', false)
        .gte('date', period.from)
        .lte('date', period.to)
      if (exErr) throw new Error(exErr.message)
      const seen = new Set((existing ?? []).map((t) => `${t.date}|${dedupKey(t.category)}|${dedupKey(t.label)}`))

      // L'ordre du fichier devient l'ordre de la journée (#161) : des clés espacées, après la dernière
      // tâche de la section ce jour-là.
      const lastKey = new Map<string, number>()
      for (const t of existing ?? []) {
        const k = `${t.date}|${t.category}`
        lastKey.set(k, Math.max(lastKey.get(k) ?? -STEP, t.position))
      }
      const rows = parsed.days.flatMap(({ date, tasks }) =>
        tasks.flatMap((t) => {
          const k = `${date}|${dedupKey(t.category)}|${dedupKey(t.label)}`
          if (seen.has(k)) {
            result.tasksSkipped++
            return []
          }
          seen.add(k)
          const slot = `${date}|${t.category}`
          const key = (lastKey.get(slot) ?? -STEP) + STEP
          lastKey.set(slot, key)
          return [
            {
              owner_id: d.ownerId,
              date,
              category: t.category,
              label: t.label,
              description: t.description,
              urgency: t.urgency,
              position: key,
              created_by: caller.id,
            },
          ]
        }),
      )
      if (rows.length > 0) {
        const { error } = await admin.from('tracker_todo_tasks').insert(rows)
        if (error) throw new Error(error.message)
      }
      result.tasksAdded = rows.length

      revalidateTodo()
      return result
    },
  })
}
