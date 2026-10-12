import { addDays, isoWeekday } from '@glagency/core'
import { DAY_TASK_CATEGORY } from './day-category'
import type { Urgency } from './urgency'

/**
 * LE FICHIER `.txt` D'UNE TO-DO (#163) — lecture pure, la même dans l'aperçu (navigateur) et dans
 * l'action (serveur, qui ne fait jamais confiance à l'aperçu). Format relevé sur l'exemple du
 * 2026-10-12, une information par ligne :
 *
 *   TO-DO DE <PRÉNOM> · <MODÈLES> · 12 → 31 OCTOBRE 2026        ← la personne visée, la période
 *   Règles : …  /  Horaires : …                                 ← notes d'en-tête, ignorées
 *   === SECTION RÉCURRENTE « ROUTINE » (à créer une seule fois) ===
 *   Matin · <tâche>                                             ← la routine, une habitude par ligne
 *   ##### SEMAINE 1 #####                                       ← informatif
 *   === LUNDI 12 OCTOBRE ===                                    ← un jour
 *   Urgences                                                    ← titre de groupe (1re ligne d'un paragraphe)
 *   Léna : <tâche>                                              ← une tâche du groupe
 *   <ligne vide>, puis le groupe suivant
 *   === SI UNE JOURNÉE SE LIBÈRE ===                            ← sans date : non importé, LISTÉ
 *
 * Le 1er format du 2026-10-12 (`[Modèle] <tâche> (<durée>)`, sans titre de groupe) reste lu : une
 * ligne qui commence par `[` ou finit par une durée n'est jamais un titre.
 *
 * Décisions de Benoit (2026-10-12) : le modèle (`Léna :` ou `[Léna]`) et le créneau `Matin ·`
 * restent dans le titre, la durée part dans la description ; toute tâche a une date, un bloc qui
 * n'est ni la routine ni un jour n'est pas importé mais apparaît dans l'aperçu. Le TITRE DE GROUPE
 * devient la section de ses tâches ce jour-là (« À faire » sans titre) ; un groupe « Urgences »
 * passe ses tâches en Urgente — le fichier le dit lui-même.
 */

export interface ImportTask {
  label: string
  description: string
  /** La section où la tâche ira : le titre de son groupe, « À faire » sans titre, la routine. */
  category: string
  urgency: Urgency
}

export interface ParsedTodoFile {
  /** Le prénom de la 1re ligne (« DORIAN ») — comparé à la personne choisie, pour avertir. */
  holder: string | null
  period: { from: string; to: string } | null
  /** Nom de la section récurrente du bloc routine (« Routine »), `null` sans bloc routine. */
  routineSection: string | null
  routine: ImportTask[]
  days: { date: string; tasks: ImportTask[] }[]
  /** Lignes lues mais non importées : bloc sans date, doublon. */
  ignored: { line: number; text: string; reason: string }[]
  /** Une seule erreur suffit à ne rien importer. */
  errors: { line: number; message: string }[]
}

const MONTHS = [
  'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE',
]
const WEEKDAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE']

/** Majuscules sans accents : « Février » et « FEVRIER » se lisent pareil. */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/**
 * La clé qui dit « même tâche » : casse, accents et espaces ne font pas deux tâches. La MÊME pour
 * les doublons du fichier (ici) et pour ce qui est déjà en base (`importTodoFile`) — sinon une ligne
 * serait doublon pour l'un et pas pour l'autre.
 */
export const dedupKey = (s: string): string => fold(s).replace(/\s+/g, ' ').trim()

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Une vraie date du calendrier (pas un 31 avril). */
const isRealDate = (y: number, m: number, d: number): boolean => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Une durée en fin de ligne : « (1 h) », « (45 min) », « (1 h 30) ». */
const DURATION = /\s*\((\d+\s*h(?:\s*\d+)?|\d+\s*min)\)\s*$/i

/** Titre et description d'une ligne de tâche — la durée part dans la description. */
function taskOf(text: string): Pick<ImportTask, 'label' | 'description'> {
  const m = DURATION.exec(text)
  if (!m) return { label: text.trim(), description: '' }
  return { label: text.slice(0, m.index).trim(), description: `Durée estimée : ${(m[1] as string).replace(/\s+/g, ' ')}` }
}

/** Une tâche au 1er format : `[Modèle] …`, ou une durée en fin de ligne. */
const looksLikeFirstFormatTask = (line: string): boolean => /^\[[^\]]+\]/.test(line) || DURATION.test(line)

/** Une ligne d'en-tête de bloc (`=== … ===`) ou de semaine (`##### … #####`). */
const isMarker = (line: string): boolean => /^={3,}.*={3,}$/.test(line) || /^#{3,}.*#{3,}$/.test(line)

/** Longueur d'une section (`category`, schémas de la To-Do). */
const SECTION_MAX = 60

/** « 12 → 31 OCTOBRE 2026 », « 28 SEPTEMBRE → 4 OCTOBRE 2026 », « 29 DÉCEMBRE → 4 JANVIER 2027 ». */
function periodOf(s: string): { from: string; to: string; endMonth: number; year: number } | null {
  const m = /(\d{1,2})(?:ER)?\s*([A-Z]+)?\s*(?:→|->|AU)\s*(\d{1,2})(?:ER)?\s+([A-Z]+)\s+(\d{4})/.exec(fold(s))
  if (!m) return null
  const endMonth = MONTHS.indexOf(m[4] as string) + 1
  const startMonth = m[2] ? MONTHS.indexOf(m[2]) + 1 : endMonth
  if (endMonth < 1 || startMonth < 1) return null
  const year = Number(m[5])
  const startYear = startMonth > endMonth ? year - 1 : year
  const [d1, d2] = [Number(m[1]), Number(m[3])]
  if (!isRealDate(startYear, startMonth, d1) || !isRealDate(year, endMonth, d2)) return null
  return { from: iso(startYear, startMonth, d1), to: iso(year, endMonth, d2), endMonth, year }
}

const TITLE_MAX = 200

export function parseTodoFile(text: string): ParsedTodoFile {
  const out: ParsedTodoFile = {
    holder: null,
    period: null,
    routineSection: null,
    routine: [],
    days: [],
    ignored: [],
    errors: [],
  }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)

  // ─── 1re ligne non vide : « TO-DO DE <PRÉNOM> · … · <période> »
  const firstAt = lines.findIndex((l) => l.trim() !== '')
  const first = firstAt >= 0 ? (lines[firstAt] as string).trim() : ''
  const head = /^TO-?DO\s+DE\s+(.+?)\s+·\s+(.+)$/i.exec(first)
  const period = head ? periodOf(head[2] as string) : null
  if (!head || !period) {
    out.errors.push({
      line: firstAt + 1,
      message: '1re ligne attendue : « TO-DO DE <PRÉNOM> · <MODÈLES> · <début> → <fin> <MOIS> <ANNÉE> ».',
    })
    return out
  }
  out.holder = (head[1] as string).trim()
  out.period = { from: period.from, to: period.to }

  // LE FORMAT, une fois pour tout le fichier : une seule ligne `[Modèle] …` ou à durée finale, et
  // c'est le 1er format — sans titres de groupe, chaque ligne d'un jour est une tâche, comme avant.
  // Décider ligne par ligne prenait une tâche sans tag en tête de jour pour un titre, et la perdait.
  const firstFormat = lines.some((l) => looksLikeFirstFormatTask(l.trim()))

  type Mode = { kind: 'none' } | { kind: 'routine' } | { kind: 'day'; date: string } | { kind: 'ignored'; title: string }
  let mode: Mode = { kind: 'none' }
  const seen = new Set<string>()
  /** Le groupe courant d'un jour — son titre, ou « À faire ». */
  let group: { name: string; urgency: Urgency } = { name: DAY_TASK_CATEGORY, urgency: 'normale' }
  /** La ligne ouvre-t-elle un paragraphe (après un en-tête de bloc ou une ligne vide) ? */
  let opensParagraph = true

  for (let i = firstAt + 1; i < lines.length; i++) {
    const n = i + 1
    const line = (lines[i] as string).trim()
    if (!line) {
      opensParagraph = true
      continue
    }
    const starts = opensParagraph
    opensParagraph = false
    // Informatif : les horaires, les titres de semaine.
    if (/^#{3,}.*#{3,}$/.test(line) || /^horaires\s*:/i.test(line)) continue

    const block = /^={3,}\s*(.+?)\s*={3,}$/.exec(line)
    if (block) {
      const title = block[1] as string
      const f = fold(title)
      if (f.includes('ROUTINE')) {
        const name = /«\s*(.+?)\s*»/.exec(title)?.[1] ?? 'Routine'
        out.routineSection = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
        mode = { kind: 'routine' }
        continue
      }
      const d = new RegExp(`^(${WEEKDAYS.join('|')})\\s+(\\d{1,2})(?:ER)?\\s+([A-Z]+)`).exec(f)
      if (d) {
        const month = MONTHS.indexOf(d[3] as string) + 1
        const day = Number(d[2])
        const year = month > period.endMonth ? period.year - 1 : period.year
        if (month < 1 || !isRealDate(year, month, day)) {
          out.errors.push({ line: n, message: `Date illisible : « ${title} ».` })
          mode = { kind: 'ignored', title }
          continue
        }
        const date = iso(year, month, day)
        if (isoWeekday(date) !== WEEKDAYS.indexOf(d[1] as string) + 1) {
          out.errors.push({ line: n, message: `« ${title} » : le ${day}/${month} n'est pas un ${(d[1] as string).toLowerCase()}.` })
        } else if (date < period.from || date > period.to) {
          out.errors.push({ line: n, message: `« ${title} » est hors de la période du fichier.` })
        }
        if (!out.days.some((x) => x.date === date)) out.days.push({ date, tasks: [] })
        mode = { kind: 'day', date }
        group = { name: DAY_TASK_CATEGORY, urgency: 'normale' }
        opensParagraph = true
        continue
      }
      mode = { kind: 'ignored', title }
      continue
    }

    // Avant le 1er bloc : des notes d'en-tête (« Règles : … », « Pas fini le soir ? … »), ignorées
    // sans être signalées. Une ligne qui a la FORME d'une tâche (`[Modèle] …`, durée en fin) reste
    // listée : c'est une tâche dont on a oublié le jour — rien ne disparaît en silence.
    if (mode.kind === 'none') {
      if (looksLikeFirstFormatTask(line)) out.ignored.push({ line: n, text: line, reason: 'hors de tout bloc' })
      continue
    }

    // Chaque paragraphe d'un jour repart de « À faire » : un paragraphe sans titre n'hérite pas du
    // groupe précédent (ni de son urgence).
    if (mode.kind === 'day' && starts) {
      group = { name: DAY_TASK_CATEGORY, urgency: 'normale' }
      // TITRE DE GROUPE (2e format seulement) : la 1re ligne d'un paragraphe, suivie d'au moins une
      // tâche. Seul « Urgences » (exactement) passe ses tâches en Urgente.
      const next = (lines[i + 1] ?? '').trim()
      if (!firstFormat && next !== '' && !isMarker(next)) {
        if (line.length > SECTION_MAX) {
          out.errors.push({ line: n, message: `Titre de groupe trop long (${line.length} caractères, ${SECTION_MAX} au plus).` })
          continue
        }
        group = { name: line, urgency: /^URGENCES?$/.test(fold(line)) ? 'urgente' : 'normale' }
        continue
      }
    }
    if (mode.kind === 'ignored') {
      out.ignored.push({ line: n, text: line, reason: `bloc sans date (« ${mode.title} »)` })
      continue
    }

    const task: ImportTask =
      mode.kind === 'routine'
        ? { ...taskOf(line), category: out.routineSection ?? 'Routine', urgency: 'normale' }
        : { ...taskOf(line), category: group.name, urgency: group.urgency }
    if (task.label.length > TITLE_MAX) {
      out.errors.push({ line: n, message: `Titre trop long (${task.label.length} caractères, ${TITLE_MAX} au plus).` })
      continue
    }
    const key = `${mode.kind === 'day' ? mode.date : 'routine'}|${dedupKey(task.category)}|${dedupKey(task.label)}`
    if (seen.has(key)) {
      out.ignored.push({ line: n, text: line, reason: 'en double dans le fichier' })
      continue
    }
    seen.add(key)
    if (mode.kind === 'routine') out.routine.push(task)
    else {
      const date = mode.date
      out.days.find((x) => x.date === date)?.tasks.push(task)
    }
  }

  out.days.sort((a, b) => (a.date < b.date ? -1 : 1))
  return out
}

/** Le nombre de jours de la période, pour l'aperçu (« 20 jours »). */
export const periodLength = (p: { from: string; to: string }): number => {
  let n = 1
  for (let d = p.from; d < p.to; d = addDays(d, 1)) n++
  return n
}

/**
 * Le prénom du fichier correspond-il à la personne choisie ? Un AVERTISSEMENT seulement (décision
 * de Benoit, 2026-10-12) : le même prénom peut être écrit autrement dans le CRM.
 */
export function holderMatches(holder: string | null, displayName: string): boolean {
  if (!holder) return false
  const words = (s: string) => fold(s).split(/[^A-Z0-9]+/).filter(Boolean)
  const name = new Set(words(displayName))
  return words(holder).some((w) => name.has(w))
}
