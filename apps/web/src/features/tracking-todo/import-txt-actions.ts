'use server'

import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, runAction, type ActionResult } from '@/lib/actions'
import { assertCanOrganize, revalidateTodo } from './actions-shared'
import { DAY_TASK_CATEGORY } from './day-category'
import { dedupKey, parseTodoFile } from './import-txt'
import { STEP } from './order'
import { importTxtInput } from './schema'
import { mergeWeekdays } from './weekdays'

/**
 * IMPORTER UN FICHIER `.txt` DANS LA TO-DO D'UNE PERSONNE (#163).
 *
 * Usage (Benoit, 2026-10-12) : un admin remplit la to-do d'un manager à partir du plan qu'il a
 * préparé. Garde-fou demandé : « s'assurer qu'ils ont bien sélectionné un mec » — l'import vise la
 * personne CHOISIE dans le sélecteur, jamais « Ma semaine » ; refusé ici aussi, l'écran n'étant
 * qu'optimiste. Déposer des tâches chez quelqu'un, c'est ORGANISER sa semaine : `assertCanOrganize`.
 *
 * Ce que l'import écrit :
 * • la ROUTINE — la section récurrente du fichier (« Routine »), tous les jours, et une habitude
 *   quotidienne par ligne, due à partir du 1er jour du fichier (`starts_on`, 0194) ; déposée par
 *   l'importeur, donc verrouillée pour son titulaire (règle 0148, décision du 2026-10-12) ;
 * • les tâches de chaque jour, dans la section de leur groupe (« À faire » sans titre), dans l'ordre
 *   du fichier, en urgence Normale — Urgente pour un groupe « Urgences ».
 *
 * Relancer le même fichier n'ajoute rien : une tâche est reconnue à (jour, section, titre), une
 * habitude à (section, titre). Un fichier qui a la moindre erreur n'écrit RIEN — la lecture est
 * entière avant la première écriture. Écritures en service-role, comme toute la to-do (0127).
 */

export interface ImportTxtResult {
  tasksAdded: number
  tasksSkipped: number
  habitsAdded: number
  habitsSkipped: number
}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

/** Rang des groupes d'un fichier : après les sections existantes (0 par défaut), avant « À faire » (999). */
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

      // ─────────────── ROUTINE : la section récurrente, et une habitude par ligne
      if (parsed.routineSection && parsed.routine.length > 0) {
        const section = parsed.routineSection
        // Les jours s'AJOUTENT à ceux d'une section du même nom (même règle que `saveSection`) :
        // une section « Routine » existante n'est pas écrasée.
        const { data: existingSection, error: secErr } = await admin
          .from('tracker_todo_sections').select('weekdays, starts_on').eq('owner_id', d.ownerId).eq('name', section).maybeSingle()
        if (secErr) throw new Error(secErr.message)
        const { error: upErr } = await admin.from('tracker_todo_sections').upsert(
          {
            owner_id: d.ownerId,
            name: section,
            weekdays: mergeWeekdays(existingSection?.weekdays ?? '', EVERY_DAY),
            // Une section NEUVE n'apparaît qu'à partir du 1er jour du fichier (0194) : sans ça, un
            // groupe « Routine » vide s'afficherait chaque jour des semaines passées. Une section
            // qui existait déjà garde sa date (nulle = partout, comme avant) : rien ne bouge chez elle.
            starts_on: existingSection ? existingSection.starts_on : period.from,
          },
          { onConflict: 'owner_id,name' },
        )
        if (upErr) throw new Error(upErr.message)

        const { data: habits, error: hErr } = await admin
          .from('tracker_todo_habits').select('category, label, position').eq('owner_id', d.ownerId)
        if (hErr) throw new Error(hErr.message)
        const known = new Set((habits ?? []).filter((h) => h.category === section).map((h) => dedupKey(h.label)))
        // Rangées APRÈS les habitudes existantes, dans l'ordre du fichier : un seul `insert` donne la
        // même `created_at` à toutes, seul `position` peut les départager (rang, #161).
        const start = Math.max(-1, ...(habits ?? []).map((h) => h.position)) + 1
        const rows = parsed.routine
          .filter((t) => {
            if (known.has(dedupKey(t.label))) {
              result.habitsSkipped++
              return false
            }
            return true
          })
          .map((t, i) => ({
            owner_id: d.ownerId,
            category: section,
            label: t.label,
            description: t.description,
            urgency: 'normale',
            weekdays: EVERY_DAY.join(','),
            starts_on: period.from,
            position: start + i,
            created_by: caller.id,
          }))
        if (rows.length > 0) {
          const { error } = await admin.from('tracker_todo_habits').insert(rows)
          // Une habitude créée au même instant a pris l'une de ces positions (index unique, 0193) :
          // aucune habitude ni tâche n'est écrite (la section, déjà posée, ne se doublera pas) —
          // relancer suffit.
          if (error?.code === '23505') {
            throw new BusinessError('Une habitude vient d’être créée en même temps : relance l’import.')
          }
          if (error) throw new Error(error.message)
        }
        result.habitsAdded = rows.length
      }

      // ─────────────── GROUPES : l'ordre du fichier, d'un jour à l'autre
      // Un titre de groupe devient la section de ses tâches ce jour-là. Sans section enregistrée,
      // la grille rangerait ces groupes par ordre alphabétique (« Chérif et outils » avant
      // « Urgences ») : on enregistre ceux qui n'existent pas encore, PONCTUELS (aucun jour : ils
      // n'apparaissent que là où ils ont des tâches) et rangés dans l'ordre où le fichier les cite —
      // après les sections existantes, avant « À faire ». Une section du même nom est laissée telle quelle.
      const groups = [...new Set(parsed.days.flatMap((x) => x.tasks.map((t) => t.category)))]
        .filter((name) => name !== DAY_TASK_CATEGORY)
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
