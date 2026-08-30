/**
 * Lecteurs du HTML du tracker Good Luck Agency (chatterstracker.duckdns.org).
 *
 * Module NEUTRE et pur (pas de `'use server'`, pas d'I/O) : testé hors-ligne contre de vraies pages
 * capturées avant d'être branché sur la reprise. Le tracker n'expose aucune API pour ces écrans —
 * seulement des pages HTML rendues côté serveur — d'où le parsing. Reprise PONCTUELLE, sur le
 * modèle de `lib/gla/` (Formation).
 *
 * Pas de DOM en Node : parsing par expressions régulières calées sur la structure RÉELLE des pages.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
}
const decode = (s: string): string =>
  String(s ?? '').replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENTITIES[m] ?? m)
/** Texte affichable : entités décodées, espaces normalisés. */
const clean = (s: string): string => decode(s).replace(/\s+/g, ' ').trim()

/** `YYYY-MM-DD` + N jours, en UTC (aucune dérive de fuseau). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Extrait le littéral objet d'une affectation JS (`var X = {...};`) par ÉQUILIBRAGE d'accolades,
 * en respectant les chaînes. Un regex non-gourmand s'arrêtait au premier `};` — un compte-rendu
 * contenant `};` tronquait le JSON et faisait perdre TOUTES les sessions du chatteur en silence.
 */
export function extractJsObject(html: string, assign: string): string | null {
  const i = html.indexOf(assign)
  if (i < 0) return null
  const start = html.indexOf('{', i)
  if (start < 0) return null
  let depth = 0
  let inStr: string | null = null
  for (let j = start; j < html.length; j++) {
    const ch = html[j]
    if (inStr) {
      if (ch === '\\') j++ // échappement : sauter le caractère suivant
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") inStr = ch
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return html.slice(start, j + 1)
    }
  }
  return null
}

export interface TrackerTask {
  sourceId: string
  date: string
  section: string
  label: string
  done: boolean
  recurring: boolean
}

/**
 * Une page `/todo?semaine=<lundi>&compte=<id>`. Rend les tâches datées, par section.
 *
 * Structure réelle : `<div class="day"><h3>lundi …</h3> … <div class="glab"><span>SECTION</span>
 * </div> <div class="task done" data-task="ID"><span class="tt">intitulé</span><span class="tm">
 * <span class="rec">habitude</span></span></div> …`. Les 7 colonnes sont dans l'ordre
 * lundi→dimanche ; la date de chacune se déduit du lundi de l'URL.
 */
export function parseTodo(html: string, weekMonday: string): { tasks: TrackerTask[]; weekNote: string } {
  const tasks: TrackerTask[] = []
  const dayChunks = html.split(/<div class="day(?:\s+\w+)?">/).slice(1)
  dayChunks.forEach((chunk, dayIndex) => {
    if (dayIndex > 6) return
    const date = addDays(weekMonday, dayIndex)
    let section = ''
    // `class="task"`, `task done`, `task done oto` (1:1)… — on capture TOUTES les classes et on
    // lit l'état coché dedans. Un regex figé sur `task( done)?` perdait les tâches 1:1 en silence.
    const re =
      /class="glab">\s*<span>([^<]*)<\/span>|class="task([^"]*)"[^>]*data-task="(\d+)"[\s\S]*?<span class="tt">([\s\S]*?)<\/span>\s*<span class="tm">([\s\S]*?)<\/span>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(chunk))) {
      if (m[1] !== undefined) {
        section = clean(m[1])
        continue
      }
      const label = clean(m[4])
      if (!label) continue
      tasks.push({
        sourceId: m[3],
        date,
        section,
        label,
        done: /\bdone\b/.test(m[2] ?? ''),
        recurring: /class="rec"/.test(m[5]),
      })
    }
  })
  const scratch = html.match(/id="scratch"[^>]*>([\s\S]*?)<\/textarea>/)
  return { tasks, weekNote: scratch ? clean(scratch[1]) : '' }
}

export interface TrackerRating {
  skill: string | null
  stars: number
  comment: string
}
export interface TrackerSession {
  sourceId: string
  date: string | null
  score: number | null
  summary: string
  author: string | null
  ratings: TrackerRating[]
}

/**
 * Une fiche `/notes/<id>`. Les SESSIONS 1:1 vivent dans un dict JS `var PAST = {...}` — source
 * fiable : date ISO complète, `score:null` distinct de 0, commentaire par compétence. L'auteur et
 * les NOMS de compétences n'y sont pas (les clés de `ratings` sont des ids PROPRES au chatteur,
 * 13-18 chez l'un, 1-6 chez l'autre) : on les résout dans le HTML de la même page.
 */
export function parseNotes(html: string): {
  sessions: TrackerSession[]
  skills: Map<string, string>
  generalNote: string
} {
  // Fiche vide / chatteur inexistant : la page fait ~60 octets.
  if (html.length < 500) return { sessions: [], skills: new Map(), generalNote: '' }

  let past: Record<string, { date?: string; score?: number | null; summary?: string; ratings?: Record<string, { r: number; c?: string }> }> = {}
  const raw = extractJsObject(html, 'var PAST')
  if (raw) {
    try {
      past = JSON.parse(raw)
    } catch {
      past = {}
    }
  }

  const skills = new Map<string, string>() // catId (propre à la page) → nom
  const catRe = /id="cat-(\d+)"[\s\S]*?class="nm">([^<]*)</g
  let cm: RegExpExecArray | null
  while ((cm = catRe.exec(html))) skills.set(cm[1], clean(cm[2]))

  const author = new Map<string, string>() // sessionId → username
  const saRe = /id="sess-(\d+)"[\s\S]*?class="sa">par\s+([^<]*)</g
  let am: RegExpExecArray | null
  while ((am = saRe.exec(html))) author.set(am[1], clean(am[2]))

  const sessions: TrackerSession[] = Object.entries(past).map(([sid, v]) => ({
    sourceId: sid,
    date: v.date ?? null,
    score: v.score === null || v.score === undefined ? null : Number(v.score),
    summary: clean(v.summary ?? ''),
    author: author.get(sid) ?? null,
    ratings: Object.entries(v.ratings ?? {}).map(([catId, r]) => ({
      skill: skills.get(catId) ?? null,
      stars: Number(r.r),
      comment: clean(r.c ?? ''),
    })),
  }))

  const gm = html.match(/id="gen"[^>]*>([\s\S]*?)<\/textarea>/)
  return { sessions, skills, generalNote: gm ? clean(gm[1]) : '' }
}

/** Le sélecteur de comptes de `/todo` : `<option value="5">axel</option>`. */
export function parseAccounts(html: string): { id: string; username: string }[] {
  const out: { id: string; username: string }[] = []
  const re = /<option value="(\d+)"[^>]*>([^<]+)<\/option>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.push({ id: m[1], username: clean(m[2]) })
  return out
}

/** La liste `/notes` : `<a class="crow" href="/notes/94"> … <span class="cn">Nom</span>`. */
export function parseChatterList(html: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = []
  const re = /href="\/notes\/(\d+)"[\s\S]*?class="cn">([^<]*)</g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.push({ id: m[1], name: clean(m[2]) })
  return out
}
