import {
  UA,
  money,
  int,
  intOrNull,
  hours,
  moneyTeamUrl,
  type ChatterSummary,
  type MoneyTeamTx,
  type MoneyTeamDay,
} from '@glagency/mypuls'

/**
 * Parser money-team pour le **Cloudflare Worker** : équivalent streaming de `parseMoneyTeam`
 * (cheerio), écrit avec `HTMLRewriter` (parseur natif Rust) pour tenir sous la limite de
 * 10 ms CPU du plan Free — cheerio construit un DOM complet (~110 ms sur cette page de 1,75 Mo).
 *
 * HTMLRewriter ne matche que les cellules ciblées (sélecteurs CSS + `:nth-child`) : le reste
 * de la page traverse le tokenizer Rust sans callback JS. Colonnes (vérifiées sur capture) :
 *   résumé `.summary-table tr.chatter-row` : 1 nom · 2 présence(actif/idle) · 3 réactivité ·
 *     4 proposé · 5 vendu · (6 taux conv. ignoré) · 7 CA PPV · 8 CA Tips · 9 CA Total
 *   détail `#sales-detail-table tbody tr` : 1 créateur · 2 chatteur · 4 montant · 6 type
 *
 * Les valeurs sont parsées avec les MÊMES helpers que cheerio (`money/int/intOrNull/hours`),
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
  const s = { name: '', active: '', idle: '', react: '', propose: '', vendu: '', ppv: '', tips: '', ca: '', open: false }
  const flushSummary = () => {
    if (s.open && s.name.trim()) {
      chatters.push({
        name: s.name.trim(),
        presenceActiveH: hours(s.active),
        presenceIdleH: hours(s.idle),
        reactiviteSec: intOrNull(s.react),
        propose: int(s.propose),
        vendu: int(s.vendu),
        caPpv: money(s.ppv),
        caTips: money(s.tips),
        ca: money(s.ca),
      })
    }
    s.name = s.active = s.idle = s.react = s.propose = s.vendu = s.ppv = s.tips = s.ca = ''
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
    .on('.summary-table tr.chatter-row', { element: () => (flushSummary(), void (s.open = true)) })
    .on('.summary-table tr.chatter-row td:nth-child(1)', { text: (t) => void (s.name += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(2) .status-active', { text: (t) => void (s.active += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(2) .status-idle', { text: (t) => void (s.idle += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(3)', { text: (t) => void (s.react += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(4)', { text: (t) => void (s.propose += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(5)', { text: (t) => void (s.vendu += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(7)', { text: (t) => void (s.ppv += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(8)', { text: (t) => void (s.tips += t.text) })
    .on('.summary-table tr.chatter-row td:nth-child(9)', { text: (t) => void (s.ca += t.text) })
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

/** Money-team d'un jour via HTMLRewriter (équivalent Worker de `fetchMoneyTeamDay`). */
export async function fetchMoneyTeamDayHR(day: string, cookie: string): Promise<MoneyTeamDay> {
  const res = await fetch(moneyTeamUrl(day), {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`GET messaging-money-team ${res.status} (${day})`)
  if (res.url.includes('/login')) throw new Error('money-team: session expirée (redirigé vers /login)')
  return parseMoneyTeamHR(res)
}
