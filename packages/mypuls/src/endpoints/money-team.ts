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
  /**
   * Id MyPuls du compte crédité : `data-current-user-id` du bouton « Éditer » de la ligne
   * (colonne Action). `null` = vente indéterminée (MyPuls ne l'attribue à personne) ou bouton
   * absent. Le libellé `chatter` dépend de la MODÈLE (1802 = « Lionel » chez Claire_sps,
   * « lioneldiv » chez Lolafps) : c'est l'id qui fait l'identité.
   */
  mypulsUserId: string | null
  amount: number
  type: string
}

/** Une paire (id MyPuls, libellé) lue dans la page des ventes — l'annuaire du jour. */
export interface MoneyTeamDirectoryEntry {
  mypulsUserId: string
  label: string
  /** `select` = libellé global du compte ; `assignable` = libellé dans l'équipe d'une modèle. */
  source: 'select' | 'assignable'
}

/**
 * Totaux affichés par MyPuls en tête de la page des ventes (cartes KPI) — calculés par MyPuls,
 * INDÉPENDANTS des lignes qu'on lit : c'est contre eux que le contrôle nocturne `b_total_page`
 * prouve qu'aucune vente n'a été perdue au parsing. Absents (ancien format, markup changé) :
 * `salesCount` null, `net` [].
 */
export interface MoneyTeamPageTotals {
  /** Carte « Ventes » : nombre de ventes de la période, indéterminées comprises. */
  salesCount: number | null
  /** Cartes « Montant net · <devise> » : total net par devise. */
  net: { currency: string; amount: number }[]
}

export interface MoneyTeamDay {
  chatters: ChatterSummary[]
  transactions: MoneyTeamTx[]
  directory: MoneyTeamDirectoryEntry[]
  pageTotals: MoneyTeamPageTotals
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

/** Id MyPuls lu dans un attribut : entier > 0, sinon `null` (vide, `all`, `-1`…). */
export function mypulsIdOf(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  return /^[1-9]\d*$/.test(v) ? v : null
}

/**
 * `assignableUsersByCreator` : le JSON que MyPuls pose dans un script inline de la page des ventes
 * pour sa fenêtre « Éditer l'attribution » — `{"<id modèle>":[{"id":1802,"label":"Lionel"}, …]}`.
 * C'est le libellé d'un compte DANS l'équipe d'une modèle, celui que portent ses ventes (0 écart
 * sur 6 268 ventes, captures 16→31/08). Absent ou illisible → `[]`. Une même paire vue dans deux
 * équipes n'est gardée qu'une fois.
 */
export function parseAssignableUsers(scriptText: string): MoneyTeamDirectoryEntry[] {
  const m = /const\s+assignableUsersByCreator\s*=\s*(\{.*?\});/.exec(scriptText)
  if (!m?.[1]) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const out: MoneyTeamDirectoryEntry[] = []
  const seen = new Set<string>()
  for (const list of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    for (const u of list as { id?: unknown; label?: unknown }[]) {
      const id = mypulsIdOf(u?.id == null ? null : String(u.id))
      const label = typeof u?.label === 'string' ? u.label.trim() : ''
      if (!id || !label || seen.has(`${id}|${label}`)) continue
      seen.add(`${id}|${label}`)
      out.push({ mypulsUserId: id, label, source: 'assignable' })
    }
  }
  return out
}

/**
 * L'annuaire de la page des ventes : le `<select name="chatter">` (un libellé global par compte,
 * homonymes compris — deux « Serge ») puis le JSON des équipes. Aucun dédoublonnage par libellé :
 * c'est au résolveur de constater qu'un libellé désigne deux comptes.
 */
export function parseMoneyTeamDirectory(html: string): MoneyTeamDirectoryEntry[] {
  const $ = cheerio.load(html)
  const out: MoneyTeamDirectoryEntry[] = []
  $('select[name="chatter"] option').each((_, o) => {
    const id = mypulsIdOf($(o).attr('value'))
    const label = $(o).text().trim()
    if (id && label) out.push({ mypulsUserId: id, label, source: 'select' })
  })
  const scripts = $('script:not([src])')
    .map((_, s) => $(s).html() ?? '')
    .get()
    .join('\n')
  return [...out, ...parseAssignableUsers(scripts)]
}

/**
 * Totaux de page depuis les cartes KPI (`.kpi-card` : libellé `h6`, valeur `h3`). Partagé par
 * cheerio et HTMLRewriter (une seule règle). Libellés EXACTS : « Ventes » et « Montant net ·
 * <devise> » (vus sur les captures du 06/09 et du 16→31/08) — l'ancien « Ventes attribuées » ne
 * compte pas : s'il revenait, le contrôle échouerait plutôt que de comparer autre chose. Une carte
 * au bon libellé mais sans aucun chiffre (« — », « n/d ») compte comme ABSENTE (`null` / aucune
 * entrée `net`), jamais comme 0 : un total illisible ne doit pas se faire passer pour « zéro vente ».
 * Plusieurs `h6` / `h3` dans une carte : leurs textes sont concaténés (cheerio comme HTMLRewriter).
 */
export function pageTotalsFromCards(cards: { label: string; value: string }[]): MoneyTeamPageTotals {
  let salesCount: number | null = null
  const net: { currency: string; amount: number }[] = []
  for (const c of cards) {
    const label = c.label.replace(/\s+/g, ' ').trim()
    const readable = /\d/.test(c.value)
    if (label === 'Ventes' && readable) salesCount = int(c.value)
    const m = /^Montant net · (\S+)$/.exec(label)
    if (m?.[1] && readable) net.push({ currency: m[1], amount: money(c.value) })
  }
  return { salesCount, net }
}

export function parseMoneyTeamPageTotals(html: string): MoneyTeamPageTotals {
  const $ = cheerio.load(html)
  const cards = $('.kpi-card')
    .map((_, k) => ({ label: $(k).find('h6').text(), value: $(k).find('h3').text() }))
    .get()
  return pageTotalsFromCards(cards)
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
          mypulsUserId: mypulsIdOf($(tr).find('.js-edit-attribution-btn').attr('data-current-user-id')),
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
  return {
    chatters: parseChatterSummary(summary),
    transactions: parseMoneyTeamSales(page),
    directory: parseMoneyTeamDirectory(page),
    pageTotals: parseMoneyTeamPageTotals(page),
  }
}
