import * as cheerio from 'cheerio'
import { BASE_URL, UA } from '../client'

/**
 * Résumé par chatteur — table « CA Total » du dashboard money-team.
 *
 * DEPUIS LE 2026-09-03, elle n'est plus rendue dans la page : MyPuls la charge en AJAX à
 * l'ouverture de son onglet, depuis `/creator/messaging-money-team/chatter-summary`. Leur propre
 * commentaire dit pourquoi — « ses colonnes (PPV proposés, réactivité) viennent d'Elasticsearch,
 * une requête par créatrice ; sur quinze jours et vingt-six comptes le calcul dépasse la minute et
 * faisait tomber la page entière en timeout, ventes comprises ». Voir `chatterSummaryUrl`.
 *
 * PLUS DE PRÉSENCE : le tableau est passé de neuf colonnes à huit, et c'est « Présence
 * (actif / idle) » qui a sauté. Ces deux champs ont donc disparu d'ici — sans perte pour l'app :
 * la mesure de présence vient du relevé « Contrôle des shifts » (`mypuls_shift_*`) depuis les
 * Releases 2.26→2.28, pas de cette page.
 */
export interface ChatterSummary {
  name: string
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
const SPACES = /[\s   ]/g

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

/**
 * URL du fragment « Résumé chatteur ».
 *
 * Bornes au format `Y-m-d H:i:s` et NON `Y-m-dTH:i` comme la page : c'est exactement ce que leur
 * JavaScript construit (`summaryUrl` dans le bloc `messagingMoneyTeamI18n`), et on recopie leur
 * forme plutôt que d'espérer que le serveur tolère la nôtre.
 */
export function chatterSummaryUrl(day: string): string {
  const start = `${day} 00:00:00`
  const end = `${addDay(day)} 00:00:00`
  return `${BASE_URL}/creator/messaging-money-team/chatter-summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
}

/**
 * Le fragment renvoyé par `chatterSummaryUrl` : une suite de `<tr class="chatter-row">`, sans
 * `<table>` autour.
 *
 * D'où l'enveloppe ajoutée avant de charger : le parseur HTML d'un DOCUMENT déplace les `<tr>`
 * orphelins hors de leur contexte (règles de « table foster parenting »), et on ne retrouverait
 * plus une seule ligne. Le fragment est donc remis dans la table dont il a été extrait.
 *
 * Colonnes, dans l'ordre du nouveau tableau (huit, la présence a disparu) :
 *   1 chatteur · 2 réactivité · 3 proposé · 4 vendu · 5 taux conv. (ignoré) ·
 *   6 CA PPV · 7 CA Tips · 8 CA Total
 */
export function parseChatterSummary(html: string): ChatterSummary[] {
  const $ = cheerio.load(`<table><tbody>${html}</tbody></table>`)
  const rows: ChatterSummary[] = []
  $('tr.chatter-row').each((_, tr) => {
    const td = $(tr).find('td')
    if (td.length < 8) return
    const name = $(td[0]).text().trim()
    if (!name) return
    rows.push({
      name,
      reactiviteSec: intOrNull($(td[1]).text()),
      propose: int($(td[2]).text()),
      vendu: int($(td[3]).text()),
      caPpv: money($(td[5]).text()),
      caTips: money($(td[6]).text()),
      ca: money($(td[7]).text()),
    })
  })
  return rows
}

/**
 * Les VENTES de la page money-team, toujours rendues côté serveur — elles ne dépendent que de
 * PostgreSQL, c'est ce qui les a épargnées lors du changement du 2026-09-03. Le résumé chatteur,
 * lui, se lit par `parseChatterSummary`.
 *
 * ANCRÉ SUR `#sales-detail-table`, comme le parser du Worker, et plus « la première table dont un
 * `th` contient Montant » : MyPuls a ajouté AVANT elle une `ranking-table` (classement des
 * chatteurs) qui porte, elle aussi, un « Montant net » — et dont la première colonne est le RANG.
 * Le sélecteur d'origine y lisait donc des créatrices nommées « 1 », « 2 », « 3 »… et rendait
 * TOUTES les transactions non ventilables (constaté en rejouant le 2026-09-03 : 644 sur 644).
 * Le Worker, ancré sur l'id, n'a jamais été touché — d'où un cron juste et un rattrapage manuel
 * silencieusement faux, la pire des combinaisons.
 */
export function parseMoneyTeamSales(html: string): MoneyTeamTx[] {
  const $ = cheerio.load(html)
  const detailEl = $('#sales-detail-table').get(0)

  const transactions: MoneyTeamTx[] = []
  if (detailEl)
    $(detailEl)
      .find('tbody tr')
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

  return transactions
}

/**
 * GET authentifié sur MyPuls, avec le contrôle de session commun aux deux requêtes du jour.
 *
 * `xhr` ne part que sur le FRAGMENT, parce que c'est là que leur JavaScript le pose : la page,
 * elle, est demandée par le navigateur comme une page. Sans effet mesuré sur la réponse (les deux
 * URL répondent avec ou sans), mais on demande ce qu'ils attendent plutôt que de compter sur leur
 * tolérance.
 */
async function getHtml(url: string, cookie: string, what: string, xhr = false): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'User-Agent': UA,
      Accept: 'text/html',
      ...(xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
    },
  })
  if (!res.ok) throw new Error(`GET ${what} ${res.status}`)
  if (res.url.includes('/login')) throw new Error(`${what}: session expirée (redirigé vers /login)`)
  return res.text()
}

/**
 * Money-team d'un jour : les ventes (page) ET le résumé par chatteur (fragment AJAX).
 * Le dashboard attribue chaque transaction à son chatteur, contrairement à l'API.
 *
 * DEUX requêtes depuis le 2026-09-03, et en parallèle : elles n'ont plus la même origine côté
 * MyPuls (PostgreSQL pour les ventes, Elasticsearch pour le résumé), donc plus la même latence.
 */
export async function fetchMoneyTeamDay(day: string, cookie: string): Promise<MoneyTeamDay> {
  const [page, summary] = await Promise.all([
    getHtml(moneyTeamUrl(day), cookie, `messaging-money-team (${day})`),
    getHtml(chatterSummaryUrl(day), cookie, `chatter-summary (${day})`, true),
  ])
  return { chatters: parseChatterSummary(summary), transactions: parseMoneyTeamSales(page) }
}
