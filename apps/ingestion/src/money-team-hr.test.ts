import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseMoneyTeamSales } from '@glagency/mypuls'
import { parseMoneyTeamHR } from './money-team-hr'

// `HTMLRewriter` n'existe que dans le runtime Workers. Ce double minimal ne fait PAS de sélecteurs CSS :
// il rejoue, dans l'ordre, les événements (élément ou texte) d'un sélecteur donné, comme le ferait le
// vrai parseur en streaming. Il teste la logique des handlers, la référence étant le parseur cheerio.
type Ev = { sel: string; attrs?: Record<string, string>; text?: string }
type Handlers = { element?: (el: { getAttribute(n: string): string | null }) => void; text?: (t: { text: string }) => void }

function stubRewriter(events: Ev[]): void {
  class FakeRewriter {
    private readonly handlers = new Map<string, Handlers[]>()
    on(sel: string, h: Handlers): this {
      this.handlers.set(sel, [...(this.handlers.get(sel) ?? []), h])
      return this
    }
    transform(_res: Response): { arrayBuffer(): Promise<ArrayBuffer> } {
      return {
        arrayBuffer: async () => {
          for (const e of events) {
            for (const h of this.handlers.get(e.sel) ?? []) {
              if (e.text !== undefined) h.text?.({ text: e.text })
              else h.element?.({ getAttribute: (n) => e.attrs?.[n] ?? null })
            }
          }
          return new ArrayBuffer(0)
        },
      }
    }
  }
  vi.stubGlobal('HTMLRewriter', FakeRewriter)
}

const ROW = '#sales-detail-table tbody tr'
const BTN = `${ROW} .js-edit-attribution-btn`
/** Une ligne de vente telle que le streaming la livre : cellules 1, 2, 4, 6 puis les boutons « Éditer ». */
const saleRow = (creator: string, chatter: string, amount: string, buttonIds: string[]): Ev[] => [
  { sel: ROW },
  { sel: `${ROW} td:nth-child(1)`, text: creator },
  { sel: `${ROW} td:nth-child(2)`, text: chatter },
  { sel: `${ROW} td:nth-child(4)`, text: amount },
  { sel: `${ROW} td:nth-child(6)`, text: 'Média privé' },
  ...buttonIds.map((id) => ({ sel: BTN, attrs: { 'data-current-user-id': id } })),
]

const IDENTITY_PAGE = readFileSync(
  new URL('../../../packages/mypuls/src/endpoints/__fixtures__/money-team-identity.html', import.meta.url),
  'utf8',
)
/** La page identité, avec un 2e bouton « Éditer » (id `second`) ajouté dans la 1re ligne de vente (1802). */
const pageWithSecondButton = (second: string, first = '1802') =>
  IDENTITY_PAGE.replace(
    'data-current-user-id="1802"\n',
    `data-current-user-id="${first}"\n`,
  ).replace(
    '<i class="ri-edit-line align-bottom"></i> Éditer\n            </button>',
    `<i class="ri-edit-line align-bottom"></i> Éditer\n            </button>\n            <button type="button" class="btn js-edit-attribution-btn" data-current-user-id="${second}">Éditer</button>`,
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseMoneyTeamHR — id du compte d’une vente, à parité avec cheerio', () => {
  it('deux boutons « Éditer » dans une ligne : le PREMIER fait foi, comme cheerio (`.find(...).attr()`)', async () => {
    const cheerio = parseMoneyTeamSales(pageWithSecondButton('9332'))
    expect(cheerio[0]?.mypulsUserId).toBe('1802')

    stubRewriter([...saleRow('Claire_sps', 'Lionel', '146,57', ['1802', '9332']), ...saleRow('Lolafps', 'lioneldiv', '12,00', ['1802'])])
    const hr = await parseMoneyTeamHR(new Response(''))
    expect(hr.transactions.map((t) => t.mypulsUserId)).toEqual(['1802', '1802'])
  })

  it('premier bouton sans id valide, second avec : null des deux côtés (pas de repli sur le second)', async () => {
    const cheerio = parseMoneyTeamSales(pageWithSecondButton('1802', ''))
    expect(cheerio[0]?.mypulsUserId).toBeNull()

    stubRewriter(saleRow('Claire_sps', 'Lionel', '146,57', ['', '1802']))
    const hr = await parseMoneyTeamHR(new Response(''))
    expect(hr.transactions[0]?.mypulsUserId).toBeNull()
  })

  it('le « premier bouton » est par ligne : la ligne suivante lit son propre bouton', async () => {
    stubRewriter([...saleRow('Claire_sps', 'Lionel', '146,57', ['1802']), ...saleRow('Claire_sps', 'Serge', '70,79', ['10504'])])
    const hr = await parseMoneyTeamHR(new Response(''))
    expect(hr.transactions.map((t) => [t.chatter, t.mypulsUserId, t.amount])).toEqual([
      ['Lionel', '1802', 146.57],
      ['Serge', '10504', 70.79],
    ])
  })
})
