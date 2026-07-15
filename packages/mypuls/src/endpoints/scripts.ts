import { BASE_URL, UA } from '../client'

/**
 * Page MyPuls `/scripts` (contexte = modèle courant, comme le chat) : cartes scripts
 * (`.script-card`, méta en data-attributes dont `data-sequence` = badge « N°x ») + table
 * « Performance des messages avec média » (`.msa-row`, une ligne par message avec stats
 * CUMULÉES depuis toujours : envois, ventes, CA net). Parser SANS cheerio (regex sur des
 * attributs machine-générés) → utilisable tel quel dans le Worker (budget 10 ms CPU).
 */
export interface CreatorScript {
  scriptId: number
  name: string
  /** Numéro du script (badge « N°x » MyPuls) — null si inconnu (script supprimé des cartes). */
  sequence: number | null
  position: number | null
  active: boolean
  msgCount: number
  mediaCount: number
  /** Somme des prix listés des messages du script. */
  priceTotal: number
  /** Cumuls depuis toujours, sommés sur les messages du script. */
  sends: number
  uniqueFans: number
  sales: number
  revenue: number
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const attr = (tag: string, name: string): string | null => {
  const v = new RegExp(`data-${name}="([^"]*)"`).exec(tag)?.[1]
  return v !== undefined ? decodeEntities(v).trim() : null
}
const toInt = (v: string | null): number => {
  const n = parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : 0
}
const toNum = (v: string | null): number => {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}
const toIntOrNull = (v: string | null): number | null => {
  const n = parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : null
}

/** Parse la page /scripts. Pur (testable sur une capture brute). */
export function parseScripts(html: string): CreatorScript[] {
  const byId = new Map<number, CreatorScript>()

  for (const m of html.matchAll(/<div\b[^>]*class="[^"]*\bscript-card\b[^"]*"[^>]*>/g)) {
    const tag = m[0]
    const id = toInt(attr(tag, 'id'))
    if (!id) continue
    byId.set(id, {
      scriptId: id,
      name: attr(tag, 'name') ?? '',
      sequence: toIntOrNull(attr(tag, 'sequence')),
      position: toIntOrNull(attr(tag, 'position')),
      active: attr(tag, 'active') === '1',
      msgCount: toInt(attr(tag, 'msg-count')),
      mediaCount: toInt(attr(tag, 'media-count')),
      priceTotal: toNum(attr(tag, 'price-total')),
      sends: 0,
      uniqueFans: 0,
      sales: 0,
      revenue: 0,
    })
  }

  for (const m of html.matchAll(/<tr\b[^>]*class="[^"]*\bmsa-row\b[^"]*"[^>]*>/g)) {
    const tag = m[0]
    const id = toInt(attr(tag, 'script-id'))
    if (!id) continue
    let s = byId.get(id)
    if (!s) {
      // Ligne orpheline (script absent des cartes, ex. supprimé) : on garde ses stats.
      s = {
        scriptId: id,
        name: attr(tag, 'script') ?? '',
        sequence: null,
        position: null,
        active: false,
        msgCount: 0,
        mediaCount: 0,
        priceTotal: 0,
        sends: 0,
        uniqueFans: 0,
        sales: 0,
        revenue: 0,
      }
      byId.set(id, s)
    }
    s.sends += toInt(attr(tag, 'sends'))
    // Fans uniques PAR MESSAGE : la somme sur-compte les fans touchés par plusieurs
    // messages — MyPuls n'expose pas le dédupliqué au grain script.
    s.uniqueFans += toInt(attr(tag, 'unique_fans'))
    s.sales += toInt(attr(tag, 'sales'))
    s.revenue += toNum(attr(tag, 'revenue'))
  }

  return [...byId.values()].sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999))
}

/** Scripts du modèle en contexte de session (appeler switchCreator avant). */
export async function fetchScripts(cookie: string): Promise<CreatorScript[]> {
  const res = await fetch(`${BASE_URL}/scripts`, {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`GET /scripts ${res.status}`)
  if (res.url.includes('/login')) throw new Error('scripts: session expirée')
  return parseScripts(await res.text())
}
