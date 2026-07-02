import * as cheerio from 'cheerio'
import { BASE_URL, UA } from '../client'

/** Résumé par chatteur (table « CA Total » du dashboard money-team). */
export interface ChatterSummary {
  name: string
  presenceActiveH: number
  presenceIdleH: number
  reactiviteSec: number | null
  propose: number
  vendu: number
  caPpv: number
  caTips: number
  ca: number
}

/** Transaction détaillée (table transactions), rattachée à son chatteur. */
export interface MoneyTeamTx {
  creator: string
  chatter: string
  amount: number
  type: string
}

export interface MoneyTeamDay {
  chatters: ChatterSummary[]
  transactions: MoneyTeamTx[]
}

// Espaces séparateurs FR : espace, insécable (00A0), fine insécable (202F), fine (2009).
const SPACES = /[\s   ]/g

// Helpers de parsing exportés : réutilisés par le parser HTMLRewriter (Worker) pour produire
// STRICTEMENT le même résultat que cheerio (une seule source de vérité par champ).
// Montant FR « 1 212,44 EUR » → 1212.44.
export function money(s: string): number {
  const t = s.replace(/EUR/gi, '').replace(SPACES, '').replace(',', '.').trim()
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}
export function int(s: string): number {
  const m = /-?\d+/.exec(s.replace(SPACES, ''))
  return m ? parseInt(m[0], 10) : 0
}
export function intOrNull(s: string): number | null {
  const m = /\d+/.exec(s)
  return m ? parseInt(m[0], 10) : null
}
// « 9h 24m » → 9.4 (heures).
export function hours(s: string): number {
  const h = /(\d+)\s*h/.exec(s)?.[1]
  const m = /(\d+)\s*m/.exec(s)?.[1]
  return (h ? +h : 0) + (m ? +m : 0) / 60
}

function addDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** URL money-team d'un jour (bornes datetime-local = début du jour → début du lendemain). */
export function moneyTeamUrl(day: string): string {
  const start = `${day}T00:00`
  const end = `${addDay(day)}T00:00`
  return `${BASE_URL}/creator/messaging-money-team?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
}

export function parseMoneyTeam(html: string): MoneyTeamDay {
  const $ = cheerio.load(html)
  const tables = $('table').toArray()
  const summaryEl = tables.find((t) =>
    $(t)
      .find('th')
      .toArray()
      .some((th) => $(th).text().trim() === 'CA Total'),
  )
  const detailEl = tables.find((t) =>
    $(t)
      .find('th')
      .toArray()
      .some((th) => $(th).text().includes('Montant')),
  )

  const chatters: ChatterSummary[] = []
  if (summaryEl)
    $(summaryEl)
      .find('tr')
      .each((_, tr) => {
        const td = $(tr).find('td')
        if (td.length < 9) return // saute l'en-tête (th)
        const name = $(td[0]).text().trim()
        if (!name) return
        const spans = $(td[1]).find('span')
        chatters.push({
          name,
          presenceActiveH: spans.length ? hours($(spans[0]).text()) : 0,
          presenceIdleH: spans.length > 1 ? hours($(spans[1]).text()) : 0,
          reactiviteSec: intOrNull($(td[2]).text()),
          propose: int($(td[3]).text()),
          vendu: int($(td[4]).text()),
          caPpv: money($(td[6]).text()),
          caTips: money($(td[7]).text()),
          ca: money($(td[8]).text()),
        })
      })

  const transactions: MoneyTeamTx[] = []
  if (detailEl)
    $(detailEl)
      .find('tr')
      .each((_, tr) => {
        const td = $(tr).find('td')
        if (td.length < 6) return
        const creator = $(td[0]).text().trim()
        if (!creator) return
        transactions.push({
          creator,
          chatter: $(td[1]).text().trim(),
          amount: money($(td[3]).text()),
          type: $(td[5]).text().trim(),
        })
      })

  return { chatters, transactions }
}

/**
 * Money-team d'un jour (`start`/`end` datetime-local = bornes du jour).
 * Le dashboard attribue chaque transaction à son chatteur (contrairement à l'API).
 */
export async function fetchMoneyTeamDay(day: string, cookie: string): Promise<MoneyTeamDay> {
  const res = await fetch(moneyTeamUrl(day), {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`GET messaging-money-team ${res.status} (${day})`)
  if (res.url.includes('/login')) throw new Error('money-team: session expirée (redirigé vers /login)')
  return parseMoneyTeam(await res.text())
}
