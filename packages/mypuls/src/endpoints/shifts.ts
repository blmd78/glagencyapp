import { BASE_URL, UA } from '../client'

/**
 * Page MyPuls « Contrôle des shifts » (`/stats/shifts`) — la mesure du temps de chatting réel.
 * Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
 *
 * Quatre surfaces, quatre parseurs :
 *   `parseShiftsPage`      le sélecteur de modèles (liste qui FAIT AUTORITÉ) + les fenêtres de créneau
 *   `parseSegmentsCsv`     l'export `report.csv` — une ligne par segment d'activité
 *   `parseTeamReport`      le fragment `report` — le verdict de couverture par créneau
 *   `parseChatterActivity` la fiche d'un chatteur — 14 KPI + la série minute par minute
 *
 * Parsés SANS cheerio (découpage + regex sur du balisage machine-généré) : ce module doit tourner
 * dans le Worker Cloudflare, dont le budget est de 10 ms CPU. Même parti pris que `scripts.ts`,
 * et c'est ce qui évite à ce flux le doublon de parseur que money-team traîne (cheerio côté CLI,
 * HTMLRewriter côté Worker).
 *
 * Tous les parseurs échouent BRUYAMMENT sur une forme inattendue. C'est délibéré : une liste vide
 * rendue silencieusement se lirait « personne n'a travaillé », et cette lecture-là produit des
 * sanctions injustes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShiftCreatorOption {
  /** `creators[]` de MyPuls — à rapprocher de `creators.mypuls_creator_id`. */
  mypulsCreatorId: string
  /** Pseudo MyPuls (« Lolafps »), pas le nom d'usage du CRM (« Lola »). */
  label: string
}

/** Fenêtre de créneau telle qu'elle est SAISIE dans MyPuls — modifiable à tout moment. */
export interface ShiftWindowRow {
  label: string
  /** `HH:MM` */
  start: string
  /** `HH:MM` */
  end: string
}

export interface ShiftsPage {
  creators: ShiftCreatorOption[]
  windows: ShiftWindowRow[]
}

export interface SegmentModel {
  label: string
  messages: number
}

export interface ShiftSegment {
  mypulsUserId: string
  chatterLabel: string
  /** Jour Paris de DÉBUT, ISO `YYYY-MM-DD`. */
  day: string
  /** `HH:MM`, heure murale Paris. */
  startTime: string
  /** Jour Paris de FIN, ISO — différent de `day` quand le segment franchit minuit. */
  endDay: string
  endTime: string
  /** « Temps actif » = le « Chatting actif » de la fiche : minutes porteuses de messages. */
  activeMinutes: number
  messages: number
  models: SegmentModel[]
}

export interface CoverageRow {
  /** ISO `YYYY-MM-DD`, résolu contre la plage demandée (MyPuls n'écrit pas l'année). */
  day: string
  /** Libellé MyPuls : « Matin », « Après-midi », « Soirée ». */
  slotLabel: string
  slotStart: string
  slotEnd: string
  chatterLabel: string
  /** Part du créneau couverte, en %. Verdict MyPuls, jamais recalculé. */
  coveragePct: number
  activeMinutes: number
  messages: number
  /** Première activité DANS le créneau, `HH:MM`. Porte le retard. */
  firstTime: string | null
  lastTime: string | null
}

export interface ChatterKpi {
  title: string
  subtitle: string
  value: string
  /** Infobulle MyPuls, qui ventile par modèle et porte son ID : « Taprofcarla (#183) : 893 min ». */
  tooltip: string | null
}

export interface ChatterActivity {
  kpis: ChatterKpi[]
  /** Un point par minute de la plage demandée. */
  series: {
    /** « 31/08 00:00 » */
    labels: string[]
    /** Messages envoyés dans la minute. */
    values: number[]
    /** 1 = minute sans message (au sens du seuil `idle`). */
    inactive: number[]
  }
  /** Phrase de MyPuls : « 12 pause(s) détectée(s). Plus longue pause: 3 min (…) ». */
  pauses: string | null
}

// ---------------------------------------------------------------------------
// Helpers — communs aux quatre parseurs
// ---------------------------------------------------------------------------

const NAMED: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ucirc: 'û', ocirc: 'ô',
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => {
      const cp = parseInt(h, 16)
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m
    })
    .replace(/&#(\d+);/g, (m, d: string) => {
      const cp = Number(d)
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m
    })
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m)

const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]+>/g, ' '))

/** Espaces normalisés, y compris insécables et fines — MyPuls sépare ses milliers avec. */
const squash = (s: string): string => s.replace(/[\s   ]+/g, ' ').trim()

const text = (s: string): string => squash(stripTags(s))

/**
 * Groupe de capture OBLIGATOIRE. `noUncheckedIndexedAccess` rend `m[1]` optionnel pour
 * TypeScript ; plutôt que de l'écraser avec un `!`, on échoue ici avec un message qui nomme ce
 * qu'on lisait. C'est la doctrine du module : une forme inattendue doit s'arrêter au plus près
 * de l'endroit où elle a été rencontrée.
 */
function grp(m: RegExpMatchArray | RegExpExecArray, i: number, what: string): string {
  const v = m[i]
  if (v === undefined) throw new Error(`shifts: ${what} — groupe ${i} manquant`)
  return v
}

/** Colonne obligatoire d'une ligne de CSV. */
function col(cells: readonly string[], i: number, name: string): string {
  const v = cells[i]
  if (v === undefined) throw new Error(`shifts: colonne « ${name} » absente`)
  return v
}


/** « 93.5 % », « 1 088 msg », « 65 % » → nombre. Virgule décimale tolérée. */
function num(raw: string): number {
  const cleaned = squash(decodeEntities(raw))
    .replace(/[\s   ]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '')
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) throw new Error(`nombre illisible : ${JSON.stringify(raw)}`)
  return n
}

/**
 * « 7h29 » → 449 ; « 8h00 » → 480 ; « 58 min » → 58.
 *
 * Sous l'heure, MyPuls change de format et écrit les minutes seules — jamais « 0h58 ». Les deux
 * formes doivent être acceptées : un chatteur qui n'a tenu qu'une demi-heure de son créneau est
 * précisément celui qu'on cherche à repérer, et le faire échouer perdrait toute la journée.
 */
function durationToMinutes(raw: string): number {
  const v = squash(decodeEntities(raw))
  const withHours = /(\d+)\s*h\s*(\d{1,2})?/.exec(v)
  if (withHours) return Number(grp(withHours, 1, 'heures')) * 60 + Number(withHours[2] ?? 0)
  const minutesOnly = /^(\d+)\s*min/.exec(v)
  if (minutesOnly) return Number(grp(minutesOnly, 1, 'minutes'))
  throw new Error(`durée illisible : ${JSON.stringify(raw)}`)
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]


/** Accents retirés, minuscules — « Février » et « fevr » se comparent alors sans piège. */
const foldAccents = (v: string): string =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * MyPuls ABRÈGE les mois dans ce tableau : « mar. 1 sept », jamais « septembre ». On compare
 * donc par PRÉFIXE — et on refuse un préfixe ambigu plutôt que de choisir entre juin et
 * juillet, parce qu'une erreur de mois range une journée entière au mauvais endroit.
 */
function monthIndex(raw: string): number {
  const v = foldAccents(raw).replace(/\.$/, '')
  const hits = MOIS.map((m, i) => [foldAccents(m), i] as const).filter(([n]) => n.startsWith(v))
  if (hits.length === 1) return hits[0]![1]
  throw new Error(
    hits.length === 0
      ? `mois inconnu : ${JSON.stringify(raw)}`
      : `mois ambigu : ${JSON.stringify(raw)} (${hits.map(([n]) => n).join(', ')})`,
  )
}

/**
 * « lun. 31 août » → « 2026-08-31 ».
 *
 * MyPuls n'écrit PAS l'année dans ce tableau. On la résout en balayant la plage demandée : sur
 * 60 jours au plus, un couple (quantième, mois) ne peut pas être ambigu. Deviner l'année à partir
 * d'« aujourd'hui » casserait au 1er janvier sur un rattrapage de décembre.
 */
function resolveDay(label: string, from: string, to: string): string {
  const m = /(\d{1,2})\s+([\p{L}]+)/u.exec(squash(decodeEntities(label)).toLowerCase())
  if (!m) throw new Error(`jour illisible : ${JSON.stringify(label)}`)
  const dayNum = Number(grp(m, 1, 'quantième du jour'))
  const monthName = grp(m, 2, 'nom du mois')
  const monthIdx = monthIndex(monthName)

  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDate() === dayNum && d.getUTCMonth() === monthIdx) return d.toISOString().slice(0, 10)
  }
  throw new Error(`jour « ${label} » hors de la plage ${from} → ${to}`)
}

/** « 26/08/2026 » → « 2026-08-26 ». */
function frDateToIso(raw: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim())
  if (!m) throw new Error(`date illisible : ${JSON.stringify(raw)}`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

const HHMM = /^\d{1,2}:\d{2}$/
function hhmm(raw: string): string {
  const v = squash(raw)
  if (!HHMM.test(v)) throw new Error(`heure illisible : ${JSON.stringify(raw)}`)
  return v.length === 4 ? `0${v}` : v
}

// ---------------------------------------------------------------------------
// 1. La page — modèles et fenêtres de créneau
// ---------------------------------------------------------------------------

/**
 * Le sélecteur `reportCreators` est la SEULE liste de modèles qui fasse autorité : elle en portait
 * 18 le 2026-09-01 quand le CRM n'en connaissait que 17. Demander le relevé sur un périmètre
 * partiel couperait artificiellement les segments d'un chatteur multi-modèles — MyPuls réunit son
 * travail en une seule vacation, mais seulement pour les modèles sélectionnés.
 */
export function parseShiftsPage(html: string): ShiftsPage {
  const sel = /<select\b[^>]*id="reportCreators"[\s\S]*?<\/select>/.exec(html)
  if (!sel) throw new Error('shifts: sélecteur reportCreators introuvable')

  const creators: ShiftCreatorOption[] = []
  for (const m of grp(sel, 0, 'sélecteur').matchAll(/<option\b[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    creators.push({ mypulsCreatorId: grp(m, 1, 'id de modèle'), label: text(grp(m, 2, 'pseudo de modèle')) })
  }
  if (creators.length === 0) throw new Error('shifts: aucun modèle dans reportCreators')

  // Les fenêtres vivent dans un formulaire répété `windows[N][label|start|end]`.
  const byIndex = new Map<string, Partial<ShiftWindowRow>>()
  for (const m of html.matchAll(
    /name="windows\[(\d+)\]\[(label|start|end)\]"[^>]*value="([^"]*)"/g,
  )) {
    const idx = grp(m, 1, 'index de fenêtre')
    const row = byIndex.get(idx) ?? {}
    row[grp(m, 2, 'champ de fenêtre') as keyof ShiftWindowRow] = decodeEntities(grp(m, 3, 'valeur de fenêtre'))
    byIndex.set(idx, row)
  }

  const windows: ShiftWindowRow[] = [...byIndex.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, w]) => w)
    .filter((w): w is ShiftWindowRow => Boolean(w.label && w.start && w.end))

  return { creators, windows }
}

// ---------------------------------------------------------------------------
// 2. Le CSV — les segments
// ---------------------------------------------------------------------------

/**
 * En-tête du CSV. La colonne « Modèles » est ABSENTE quand un seul modèle est demandé —
 * vérifié le 2026-09-03 : MyPuls la retire, il n'y aurait rien à ventiler. Les huit premières
 * colonnes, elles, ne bougent pas.
 */
const CSV_HEADER = [
  'Chatteur', 'ID chatteur', 'Jour', 'Début', 'Fin', 'Jour de fin',
  'Temps actif', 'Messages',
]
const CSV_MODELS = 'Modèles'

/** Découpage `;` avec guillemets — le nom d'un chatteur peut en contenir. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ';') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

/**
 * « Lolafps (322) | Claire_sps (310) » → deux modèles et leurs messages.
 * Le nombre entre parenthèses est bien un NOMBRE DE MESSAGES et non un identifiant : vérifié le
 * 2026-09-01, la somme des parenthèses égale la colonne `Messages` sur 4 218 lignes sur 4 218.
 */
function parseModels(raw: string): SegmentModel[] {
  const v = squash(raw)
  if (!v) return []
  return v.split('|').map((chunk) => {
    const m = /^(.*)\((\d+)\)$/.exec(chunk.trim())
    if (!m) throw new Error(`modèle illisible : ${JSON.stringify(chunk)}`)
    return { label: grp(m, 1, 'pseudo de modèle').trim(), messages: Number(grp(m, 2, 'messages du modèle')) }
  })
}

/**
 * Export `/stats/shifts/report.csv`. Une ligne par segment d'activité, pour TOUTE l'agence et
 * toute la plage, en un seul appel.
 */
export function parseSegmentsCsv(csv: string): ShiftSegment[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('shifts: CSV vide (pas même d’en-tête)')

  const header = splitCsvLine(col(lines, 0, 'en-tête')).map((h) => squash(h))
  if (header.length < CSV_HEADER.length || CSV_HEADER.some((h, i) => h !== header[i])) {
    throw new Error(`shifts: en-tête CSV inattendu — ${JSON.stringify(header)}`)
  }
  const hasModels = header[CSV_HEADER.length] === CSV_MODELS
  if (header.length > CSV_HEADER.length && !hasModels) {
    throw new Error(`shifts: colonne inconnue après « Messages » — ${JSON.stringify(header)}`)
  }
  const width = CSV_HEADER.length + (hasModels ? 1 : 0)

  return lines.slice(1).map((line, i) => {
    const c = splitCsvLine(line)
    if (c.length !== width) {
      throw new Error(`shifts: ligne ${i + 2} a ${c.length} colonnes (attendu ${width})`)
    }
    return {
      chatterLabel: squash(col(c, 0, 'Chatteur')),
      mypulsUserId: squash(col(c, 1, 'ID chatteur')),
      day: frDateToIso(col(c, 2, 'Jour')),
      startTime: hhmm(col(c, 3, 'Début')),
      endTime: hhmm(col(c, 4, 'Fin')),
      endDay: frDateToIso(col(c, 5, 'Jour de fin')),
      activeMinutes: num(col(c, 6, 'Temps actif')),
      messages: num(col(c, 7, 'Messages')),
      models: hasModels ? parseModels(col(c, 8, 'Modèles')) : [],
    }
  })
}

// ---------------------------------------------------------------------------
// 3. Le fragment d'équipe — la couverture des créneaux
// ---------------------------------------------------------------------------

/**
 * Tableau « Couverture des créneaux » du fragment `/stats/shifts/report`.
 *
 * Le tableau se termine à ~432 ko sur les 1,2 Mo du fragment : l'appelant peut couper le flux au
 * premier `</table>` (cf. `fetchTeamReport`). Le libellé du jour n'apparaît QUE sur la première
 * ligne de chaque journée (les suivantes ont une cellule vide) : on le reporte.
 *
 * Ces lignes ne portent que le NOM du chatteur, jamais son ID — la résolution se fait via le CSV
 * du même run, où le couple (nom, ID) est bijectif.
 */
export function parseTeamReport(html: string, range: { from: string; to: string }): CoverageRow[] {
  const table = /<table\b[^>]*class="[^"]*\bshift-table\b[^"]*"[\s\S]*?<\/table>/.exec(html)
  if (!table) throw new Error('shifts: tableau de couverture introuvable')

  const rows: CoverageRow[] = []
  let currentDay: string | null = null

  for (const tr of grp(table, 0, 'tableau').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...grp(tr, 1, 'ligne').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      grp(m, 1, 'cellule'),
    )
    if (cells.length < 3) continue // l'en-tête (<th>) et les lignes vides

    const dayLabel = text(col(cells, 0, 'jour'))
    if (dayLabel) currentDay = resolveDay(dayLabel, range.from, range.to)
    if (!currentDay) throw new Error('shifts: ligne de couverture sans jour de rattachement')

    const slot = text(col(cells, 1, 'créneau'))
    const slotBounds = /(\d{1,2}:\d{2})\s*(?:→|->|&rarr;)\s*(\d{1,2}:\d{2})/.exec(slot)
    if (!slotBounds) throw new Error(`shifts: bornes de créneau illisibles — ${JSON.stringify(slot)}`)
    const slotFrom = grp(slotBounds, 1, 'début de créneau')
    const slotTo = grp(slotBounds, 2, 'fin de créneau')
    const slotLabel = squash(slot.slice(0, slot.indexOf(slotFrom)))

    // Découpage sur l'OUVRANT, pas sur le fermant : chaque bloc contient une barre de progression
    // imbriquée (`<div class="progress">…<div class="progress-bar">`), donc un `</div>` non-greedy
    // couperait le bloc avant le pourcentage et la durée.
    const blocks = col(cells, 2, 'chatteurs du créneau').split('<div class="shift-worker">').slice(1)
    for (const b of blocks) {
      rows.push(parseWorker(b, currentDay, slotLabel, slotFrom, slotTo))
    }
  }

  if (rows.length === 0) throw new Error('shifts: tableau de couverture sans aucune ligne')
  return rows
}

const pick = (block: string, cls: string): string | null => {
  const m = new RegExp(`shift-worker__${cls}[^>]*>([\\s\\S]*?)<`).exec(block)
  return m ? text(grp(m, 1, `champ ${cls}`)) : null
}

function parseWorker(
  block: string,
  day: string,
  slotLabel: string,
  slotStart: string,
  slotEnd: string,
): CoverageRow {
  const name = pick(block, 'name')
  const pct = pick(block, 'pct')
  const time = pick(block, 'time')
  if (name === null || pct === null || time === null) {
    throw new Error('shifts: bloc de couverture incomplet (nom, % ou durée manquant)')
  }
  // `msg` est absent quand le chatteur n'a envoyé aucun message sur le créneau.
  const msg = pick(block, 'msg')
  const span = pick(block, 'span')
  const bounds = span ? /(\d{1,2}:\d{2})\s*(?:→|->)\s*(\d{1,2}:\d{2})/.exec(span) : null

  return {
    day,
    slotLabel,
    slotStart: hhmm(slotStart),
    slotEnd: hhmm(slotEnd),
    chatterLabel: name,
    coveragePct: num(pct),
    activeMinutes: durationToMinutes(time),
    messages: msg ? num(msg) : 0,
    firstTime: bounds ? hhmm(grp(bounds, 1, 'première activité')) : null,
    lastTime: bounds ? hhmm(grp(bounds, 2, 'dernière activité')) : null,
  }
}

// ---------------------------------------------------------------------------
// 4. La fiche d'un chatteur — 14 KPI + la minute par minute
// ---------------------------------------------------------------------------

/**
 * Onglet « Activité du chatteur ». Chargé À LA DEMANDE : c'est un appel par chatteur et par
 * plage (~186 ko), là où les trois autres surfaces couvrent toute l'agence en un appel.
 *
 * Vérifié le 2026-09-01 : la page répond pour n'importe quel chatteur et n'importe quelle plage
 * SANS `switchCreator` préalable — elle agrège d'elle-même les comptes liés de la personne.
 */
export function parseChatterActivity(html: string): ChatterActivity {
  const kpis: ChatterKpi[] = []
  // `((?:[^>"]|"[^"]*")*)` et non `[^>]*` : l'attribut `title` de la tuile contient du HTML
  // (« … : 1817<br> »), donc un `[^>]*` s'arrêterait sur le `>` de ce `<br>` et la « valeur »
  // commencerait par `">`. On consomme chaque attribut guillemeté comme un bloc.
  const re =
    /kpi-title[^>]*>([\s\S]*?)<\/h6>[\s\S]*?kpi-subtitle[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="kpi-value"((?:[^>"]|"[^"]*")*)>([\s\S]*?)<\/div>/g
  for (const m of html.matchAll(re)) {
    const tooltip = /title="([^"]*)"/.exec(grp(m, 3, 'attributs de la tuile'))?.[1]
    kpis.push({
      title: text(grp(m, 1, 'titre du KPI')),
      subtitle: text(grp(m, 2, 'sous-titre du KPI')),
      value: text(grp(m, 4, 'valeur du KPI')),
      tooltip: tooltip ? text(tooltip.replace(/<br\s*\/?>/gi, ' · ')) : null,
    })
  }
  if (kpis.length === 0) throw new Error('shifts: aucun KPI sur la fiche chatteur')

  const series = {
    labels: jsonArray<string>(html, 'labels'),
    values: jsonArray<number>(html, 'values'),
    inactive: jsonArray<number>(html, 'inactive'),
  }
  if (series.labels.length !== series.values.length || series.labels.length !== series.inactive.length) {
    throw new Error('shifts: séries minute par minute de longueurs différentes')
  }

  // Deux phrases : « 12 pause(s) détectée(s). Plus longue pause: 3 min (…). » On borne la seconde
  // à une phrase — après `stripTags` il ne reste plus un seul `<`, donc un `[^<]*` avalerait le
  // fichier entier.
  const pauses = /\d+\s*pause\(s\)\s*détectée\(s\)\.(?:[^.]*\.)?/.exec(squash(stripTags(html)))
  return { kpis, series, pauses: pauses ? squash(pauses[0]) : null }
}

function jsonArray<T>(html: string, name: string): T[] {
  const m = new RegExp(`(?:const|var|let)\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`).exec(html)
  if (!m) throw new Error(`shifts: série « ${name} » introuvable`)
  return JSON.parse(grp(m, 1, `série ${name}`)) as T[]
}

// ---------------------------------------------------------------------------
// Accès réseau
// ---------------------------------------------------------------------------

const headers = (cookie: string, accept: string) => ({
  Cookie: cookie,
  'User-Agent': UA,
  Accept: accept,
  'X-Requested-With': 'XMLHttpRequest',
})

async function get(url: string, cookie: string, accept: string): Promise<Response> {
  const res = await fetch(url, { headers: headers(cookie, accept) })
  if (!res.ok) throw new Error(`GET ${new URL(url).pathname} ${res.status}`)
  if (res.url.includes('/login')) throw new Error('shifts: session expirée (redirigé vers /login)')
  return res
}

export async function fetchShiftsPage(cookie: string): Promise<ShiftsPage> {
  const res = await get(`${BASE_URL}/stats/shifts`, cookie, 'text/html')
  return parseShiftsPage(await res.text())
}

export interface ReportQuery {
  /** ISO. */
  from: string
  /**
   * ISO, et **jour + 1** par rapport au jour qu'on veut mesurer : le créneau du soir court
   * jusqu'à 05:00 le lendemain. Mesuré le 2026-09-01 : sur 31/08→31/08 un chatteur affiche 37,1 %
   * de couverture, sur 31/08→01/09 il en affiche 97,5 %.
   */
  to: string
  idleMinutes: number
  breakMinutes: number
  mypulsCreatorIds: string[]
}

function reportQs(q: ReportQuery): string {
  const p = new URLSearchParams({
    reportStart: q.from,
    reportEnd: q.to,
    idle: String(q.idleMinutes),
    break: String(q.breakMinutes),
  })
  for (const id of q.mypulsCreatorIds) p.append('creators[]', id)
  return p.toString()
}

export async function fetchSegments(cookie: string, q: ReportQuery): Promise<ShiftSegment[]> {
  const res = await get(`${BASE_URL}/stats/shifts/report.csv?${reportQs(q)}`, cookie, 'text/csv')
  return parseSegmentsCsv(await res.text())
}

/**
 * Le fragment pèse ~1,2 Mo pour deux jours, mais le tableau de couverture s'arrête à ~432 ko :
 * tout le reste est le détail par chatteur, que le CSV nous donne déjà en mieux. On coupe le flux
 * dès qu'on a le premier `</table>`.
 */
export async function fetchTeamReport(cookie: string, q: ReportQuery): Promise<CoverageRow[]> {
  const res = await get(`${BASE_URL}/stats/shifts/report?${reportQs(q)}`, cookie, 'text/html')
  return parseTeamReport(await readUntilTableEnd(res), { from: q.from, to: q.to })
}

async function readUntilTableEnd(res: Response): Promise<string> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      if (buf.includes('</table>')) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return buf
}

export async function fetchChatterActivity(
  cookie: string,
  opts: { mypulsUserId: string; start: string; end: string; idleMinutes?: number },
): Promise<ChatterActivity> {
  const p = new URLSearchParams({
    tab: 'activity',
    chatter: opts.mypulsUserId,
    start: opts.start,
    end: opts.end,
  })
  // Sans ce paramètre, MyPuls applique SON défaut : la fiche afficherait un « Chatting actif »
  // calculé sur un autre seuil que le relevé d'à côté. Le jour où le réglage passe de 3 à 10,
  // les deux moitiés de la même page se contrediraient d'environ deux heures.
  if (opts.idleMinutes !== undefined) p.set('idle', String(opts.idleMinutes))
  const res = await get(`${BASE_URL}/stats/shifts?${p.toString()}`, cookie, 'text/html')
  return parseChatterActivity(await res.text())
}
