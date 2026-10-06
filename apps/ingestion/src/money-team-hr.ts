import {
  UA,
  money,
  int,
  intOrNull,
  mypulsIdOf,
  pageTotalsFromCards,
  parseAssignableUsers,
  moneyTeamUrl,
  chatterSummaryUrl,
  type ChatterSummary,
  type MoneyTeamDirectoryEntry,
  type MoneyTeamTx,
  type MoneyTeamDay,
} from '@glagency/mypuls'
import { decodeEntities } from './norm'

/**
 * Parser money-team pour le **Cloudflare Worker** : équivalent streaming de `parseChatterSummary`
 * + `parseMoneyTeamSales` + `parseMoneyTeamDirectory` + `parseMoneyTeamPageTotals` (cheerio), écrit
 * avec `HTMLRewriter` (parseur natif Rust) pour tenir sous la limite de 10 ms CPU du plan Free —
 * cheerio construit un DOM complet (~110 ms sur cette page de 1,75 Mo).
 *
 * Sélecteurs (vérifiés sur capture du 2026-09-06) :
 *   résumé `tr.chatter-row` : 1 nom · 2 réactivité · 3 proposé · 4 vendu ·
 *     (5 taux conv. ignoré) · 6 CA PPV · 7 CA Tips · 8 CA Total
 *   détail `#sales-detail-table tbody tr` : 1 créateur · 2 chatteur · 4 montant · 6 type
 *     + l'id MyPuls du compte, attribut `data-current-user-id` du bouton « Éditer » (colonne 9)
 *   annuaire : options de `select[name="chatter"]` + JSON `assignableUsersByCreator` (script inline)
 *   totaux de page : cartes `.kpi-card` (libellé `h6`, valeur `h3`)
 *
 * DEUX DOCUMENTS DEPUIS LE 2026-09-03 : le résumé chatteur a quitté la page pour un fragment
 * chargé en AJAX (cf. `chatterSummaryUrl`). Les jeux de sélecteurs sont DISJOINTS, donc la même
 * fonction lit indifféremment la page (elle y trouve ventes, annuaire et totaux) ou le fragment
 * (il y trouve le résumé) — `fetchMoneyTeamDayHR` l'appelle une fois sur chacun et fusionne. Le
 * sélecteur du résumé ne préfixe donc pas `.summary-table` : dans le fragment, cette table n'est
 * pas là.
 *
 * Les valeurs passent par les MÊMES helpers que cheerio : résultat identique champ par champ.
 * Seul écart de nature : `HTMLRewriter` livre le texte BRUT, sans décoder les entités HTML
 * (« O&#039;NEAL » là où cheerio rend « O'NEAL ») — les textes (noms, créateur, type, libellé
 * d'option) sont donc décodés au flush par `decodeEntities`, comme le fait cheerio. Les attributs
 * (`getAttribute`) arrivent déjà décodés ; les nombres n'ont pas d'entité.
 */

// `HTMLRewriter` est un global du runtime Workers (absent de Node) — déclaré pour TypeScript.
interface HtmlElement {
  getAttribute(name: string): string | null
}
interface HtmlRewriter {
  on(
    selector: string,
    handlers: { element?: (el: HtmlElement) => void; text?: (t: { text: string }) => void },
  ): HtmlRewriter
  transform(res: Response): Response
}
declare const HTMLRewriter: { new (): HtmlRewriter }

/** Transforme une réponse HTML money-team en `MoneyTeamDay` (streaming, sans DOM). */
export async function parseMoneyTeamHR(res: Response): Promise<MoneyTeamDay> {
  const chatters: ChatterSummary[] = []
  const transactions: MoneyTeamTx[] = []
  const directory: MoneyTeamDirectoryEntry[] = []
  const cards: { label: string; value: string }[] = []

  // Accumulateurs de la ligne résumé courante (texte brut, parsé au flush).
  const s = { name: '', react: '', propose: '', vendu: '', ppv: '', tips: '', ca: '', open: false }
  const flushSummary = () => {
    const name = decodeEntities(s.name).trim()
    if (s.open && name) {
      chatters.push({
        name,
        reactiviteSec: intOrNull(s.react),
        propose: int(s.propose),
        vendu: int(s.vendu),
        caPpv: money(s.ppv),
        caTips: money(s.tips),
        ca: money(s.ca),
      })
    }
    s.name = s.react = s.propose = s.vendu = s.ppv = s.tips = s.ca = ''
    s.open = false
  }

  // Ligne détail courante. `userId` vient de l'attribut du PREMIER bouton « Éditer » de la ligne
  // (`btn` : déjà lu), comme cheerio (`.find(...).attr()` lit le premier élément, valide ou non).
  const d = { creator: '', chatter: '', amount: '', type: '', userId: null as string | null, btn: false, open: false }
  const flushDetail = () => {
    const creator = decodeEntities(d.creator).trim()
    if (d.open && creator) {
      transactions.push({
        creator,
        chatter: decodeEntities(d.chatter).trim(),
        mypulsUserId: d.userId,
        amount: money(d.amount),
        type: decodeEntities(d.type).trim(),
      })
    }
    d.creator = d.chatter = d.amount = d.type = ''
    d.userId = null
    d.btn = false
    d.open = false
  }

  // Option courante du select chatteur.
  const o = { value: null as string | null, label: '', open: false }
  const flushOption = () => {
    const label = decodeEntities(o.label).trim()
    if (o.open && o.value && label) directory.push({ mypulsUserId: o.value, label, source: 'select' })
    o.value = null
    o.label = ''
    o.open = false
  }

  // Carte KPI courante.
  const k = { label: '', value: '', open: false }
  const flushCard = () => {
    if (k.open) cards.push({ label: decodeEntities(k.label), value: decodeEntities(k.value) })
    k.label = k.value = ''
    k.open = false
  }

  // Texte des scripts inline : seul `assignableUsersByCreator` en est extrait (~50 Ko par page).
  let scripts = ''

  const rw = new HTMLRewriter()
    .on('tr.chatter-row', { element: () => (flushSummary(), void (s.open = true)) })
    .on('tr.chatter-row td:nth-child(1)', { text: (t) => void (s.name += t.text) })
    .on('tr.chatter-row td:nth-child(2)', { text: (t) => void (s.react += t.text) })
    .on('tr.chatter-row td:nth-child(3)', { text: (t) => void (s.propose += t.text) })
    .on('tr.chatter-row td:nth-child(4)', { text: (t) => void (s.vendu += t.text) })
    .on('tr.chatter-row td:nth-child(6)', { text: (t) => void (s.ppv += t.text) })
    .on('tr.chatter-row td:nth-child(7)', { text: (t) => void (s.tips += t.text) })
    .on('tr.chatter-row td:nth-child(8)', { text: (t) => void (s.ca += t.text) })
    .on('#sales-detail-table tbody tr', { element: () => (flushDetail(), void (d.open = true)) })
    .on('#sales-detail-table tbody tr td:nth-child(1)', { text: (t) => void (d.creator += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(2)', { text: (t) => void (d.chatter += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(4)', { text: (t) => void (d.amount += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(6)', { text: (t) => void (d.type += t.text) })
    .on('#sales-detail-table tbody tr .js-edit-attribution-btn', {
      element: (el) => {
        if (d.btn) return
        d.btn = true
        d.userId = mypulsIdOf(el.getAttribute('data-current-user-id'))
      },
    })
    .on('select[name="chatter"] option', {
      element: (el) => {
        flushOption()
        o.open = true
        o.value = mypulsIdOf(el.getAttribute('value'))
      },
      text: (t) => void (o.label += t.text),
    })
    .on('.kpi-card', { element: () => (flushCard(), void (k.open = true)) })
    .on('.kpi-card h6', { text: (t) => void (k.label += t.text) })
    .on('.kpi-card h3', { text: (t) => void (k.value += t.text) })
    .on('script', { text: (t) => void (scripts += t.text) })

  // Consommer la réponse transformée pilote le parsing (on jette la sortie).
  await rw.transform(res).arrayBuffer()
  flushSummary()
  flushDetail()
  flushOption()
  flushCard()
  directory.push(...parseAssignableUsers(scripts))
  return { chatters, transactions, directory, pageTotals: pageTotalsFromCards(cards) }
}

/**
 * GET authentifié, avec le contrôle de session commun aux deux requêtes du jour.
 * `xhr` seulement sur le FRAGMENT, là où leur JavaScript le pose.
 */
async function get(url: string, cookie: string, what: string, xhr = false): Promise<Response> {
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
  return res
}

/**
 * Money-team d'un jour via HTMLRewriter (équivalent Worker de `fetchMoneyTeamDay`) : ventes,
 * annuaire et totaux viennent de la page, le résumé par chatteur de son fragment. Les deux requêtes
 * partent en parallèle — elles n'ont plus la même origine côté MyPuls (PostgreSQL pour la page,
 * Elasticsearch pour le fragment), donc plus la même latence.
 */
export async function fetchMoneyTeamDayHR(day: string, cookie: string): Promise<MoneyTeamDay> {
  const [page, summary] = await Promise.all([
    get(moneyTeamUrl(day), cookie, `messaging-money-team (${day})`),
    get(chatterSummaryUrl(day), cookie, `chatter-summary (${day})`, true),
  ])
  const [sales, chatters] = await Promise.all([parseMoneyTeamHR(page), parseMoneyTeamHR(summary)])
  return {
    chatters: chatters.chatters,
    transactions: sales.transactions,
    directory: sales.directory,
    pageTotals: sales.pageTotals,
  }
}
