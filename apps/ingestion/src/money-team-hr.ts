import {
  UA,
  money,
  int,
  intOrNull,
  moneyTeamUrl,
  chatterSummaryUrl,
  type ChatterSummary,
  type MoneyTeamTx,
  type MoneyTeamDay,
} from '@glagency/mypuls'

/**
 * Parser money-team pour le **Cloudflare Worker** : équivalent streaming de `parseChatterSummary`
 * + `parseMoneyTeamSales` (cheerio), écrit avec `HTMLRewriter` (parseur natif Rust) pour tenir
 * sous la limite de 10 ms CPU du plan Free — cheerio construit un DOM complet (~110 ms sur cette
 * page de 1,75 Mo).
 *
 * HTMLRewriter ne matche que les cellules ciblées (sélecteurs CSS + `:nth-child`) : le reste
 * de la page traverse le tokenizer Rust sans callback JS. Colonnes (vérifiées sur capture du
 * 2026-09-06) :
 *   résumé `tr.chatter-row` : 1 nom · 2 réactivité · 3 proposé · 4 vendu ·
 *     (5 taux conv. ignoré) · 6 CA PPV · 7 CA Tips · 8 CA Total
 *   détail `#sales-detail-table tbody tr` : 1 créateur · 2 chatteur · 4 montant · 6 type
 *
 * DEUX DOCUMENTS DEPUIS LE 2026-09-03 : le résumé chatteur a quitté la page pour un fragment
 * chargé en AJAX (cf. `chatterSummaryUrl`). Les deux jeux de sélecteurs sont DISJOINTS, donc la
 * même fonction lit indifféremment la page (elle y trouve les ventes) ou le fragment (il y trouve
 * le résumé) — `fetchMoneyTeamDayHR` l'appelle une fois sur chacun et fusionne. Le sélecteur du
 * résumé ne préfixe plus `.summary-table` : dans le fragment, cette table n'est pas là.
 *
 * Les valeurs sont parsées avec les MÊMES helpers que cheerio (`money/int/intOrNull`),
 * donc résultat identique champ par champ.
 */

// `HTMLRewriter` est un global du runtime Workers (absent de Node) — déclaré pour TypeScript.
interface HtmlRewriter {
  on(
    selector: string,
    handlers: { element?: (el: unknown) => void; text?: (t: { text: string }) => void },
  ): HtmlRewriter
  transform(res: Response): Response
}
declare const HTMLRewriter: { new (): HtmlRewriter }

/** Transforme une réponse HTML money-team en `MoneyTeamDay` (streaming, sans DOM). */
export async function parseMoneyTeamHR(res: Response): Promise<MoneyTeamDay> {
  const chatters: ChatterSummary[] = []
  const transactions: MoneyTeamTx[] = []

  // Accumulateurs de la ligne résumé courante (texte brut, parsé au flush).
  const s = { name: '', react: '', propose: '', vendu: '', ppv: '', tips: '', ca: '', open: false }
  const flushSummary = () => {
    if (s.open && s.name.trim()) {
      chatters.push({
        name: s.name.trim(),
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

  // Accumulateurs de la ligne détail courante.
  const d = { creator: '', chatter: '', amount: '', type: '', open: false }
  const flushDetail = () => {
    if (d.open && d.creator.trim()) {
      transactions.push({
        creator: d.creator.trim(),
        chatter: d.chatter.trim(),
        amount: money(d.amount),
        type: d.type.trim(),
      })
    }
    d.creator = d.chatter = d.amount = d.type = ''
    d.open = false
  }

  const rw = new HTMLRewriter()
    // Résumé chatteurs. La ligne s'ouvre → on flush la précédente.
    .on('tr.chatter-row', { element: () => (flushSummary(), void (s.open = true)) })
    .on('tr.chatter-row td:nth-child(1)', { text: (t) => void (s.name += t.text) })
    .on('tr.chatter-row td:nth-child(2)', { text: (t) => void (s.react += t.text) })
    .on('tr.chatter-row td:nth-child(3)', { text: (t) => void (s.propose += t.text) })
    .on('tr.chatter-row td:nth-child(4)', { text: (t) => void (s.vendu += t.text) })
    .on('tr.chatter-row td:nth-child(6)', { text: (t) => void (s.ppv += t.text) })
    .on('tr.chatter-row td:nth-child(7)', { text: (t) => void (s.tips += t.text) })
    .on('tr.chatter-row td:nth-child(8)', { text: (t) => void (s.ca += t.text) })
    // Détail transactions.
    .on('#sales-detail-table tbody tr', { element: () => (flushDetail(), void (d.open = true)) })
    .on('#sales-detail-table tbody tr td:nth-child(1)', { text: (t) => void (d.creator += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(2)', { text: (t) => void (d.chatter += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(4)', { text: (t) => void (d.amount += t.text) })
    .on('#sales-detail-table tbody tr td:nth-child(6)', { text: (t) => void (d.type += t.text) })

  // Consommer la réponse transformée pilote le parsing (on jette la sortie).
  await rw.transform(res).arrayBuffer()
  flushSummary() // dernières lignes (aucun `tr` suivant pour les flusher).
  flushDetail()
  return { chatters, transactions }
}

/** GET authentifié, avec le contrôle de session commun aux deux requêtes du jour. */
async function get(url: string, cookie: string, what: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'User-Agent': UA,
      Accept: 'text/html',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!res.ok) throw new Error(`GET ${what} ${res.status}`)
  if (res.url.includes('/login')) throw new Error(`${what}: session expirée (redirigé vers /login)`)
  return res
}

/**
 * Money-team d'un jour via HTMLRewriter (équivalent Worker de `fetchMoneyTeamDay`) : les ventes
 * viennent de la page, le résumé par chatteur de son fragment. Les deux en parallèle — elles n'ont
 * plus la même origine côté MyPuls (PostgreSQL / Elasticsearch), donc plus la même latence.
 */
export async function fetchMoneyTeamDayHR(day: string, cookie: string): Promise<MoneyTeamDay> {
  const [page, summary] = await Promise.all([
    get(moneyTeamUrl(day), cookie, `messaging-money-team (${day})`),
    get(chatterSummaryUrl(day), cookie, `chatter-summary (${day})`),
  ])
  const [sales, chatters] = await Promise.all([parseMoneyTeamHR(page), parseMoneyTeamHR(summary)])
  return { chatters: chatters.chatters, transactions: sales.transactions }
}
