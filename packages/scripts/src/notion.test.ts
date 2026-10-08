import { describe, expect, it } from 'vitest'
import { NotionError, blocksToText, fetchNotionPage, listSharedPages, notionPageId, type NotionBlock } from './notion'

const rt = (plain_text: string) => [{ plain_text }]
let seq = 0
const block = (type: string, data: Record<string, unknown>, children?: NotionBlock[]): NotionBlock =>
  ({ id: `${type}-${seq++}`, type, has_children: !!children, [type]: data, ...(children ? { children } : {}) }) as NotionBlock

describe('notionPageId', () => {
  it('lit l’id d’un lien Notion, avec ou sans tirets', () => {
    expect(notionPageId('https://app.notion.com/p/3ec9f2489f8f81fc8ffee67ca207d695?pvs=204')).toBe('3ec9f248-9f8f-81fc-8ffe-e67ca207d695')
    expect(notionPageId('https://www.notion.so/Script-de-vente-Emma-3ec9f2489f8f81fc8ffee67ca207d695')).toBe(
      '3ec9f248-9f8f-81fc-8ffe-e67ca207d695',
    )
    expect(notionPageId('3ec9f248-9f8f-81fc-8ffe-e67ca207d695')).toBe('3ec9f248-9f8f-81fc-8ffe-e67ca207d695')
  })
  it('refuse une entrée sans id', () => {
    expect(() => notionPageId('https://notion.so/nimporte')).toThrow('lien Notion sans id de page')
  })
})

describe('blocksToText', () => {
  it('rend titres, bulles, encadrés, listes, tableaux, liens de pages et enfants indentés', () => {
    const text = blocksToText([
      block('heading_2', { rich_text: rt('🤝 Transition et qualification') }),
      block('paragraph', { rich_text: rt('#1 — Transition de confiance') }),
      block('quote', { rich_text: rt('et du coup…') }),
      block('callout', { rich_text: rt('Si le fan n’est pas libre → script relationnel'), icon: { emoji: '⚠️' } }),
      block('bulleted_list_item', { rich_text: rt('🔴 = mauvaise réponse') }, [block('paragraph', { rich_text: rt('détail') })]),
      block('numbered_list_item', { rich_text: rt('Ouverture') }),
      block('table', {}, [block('table_row', { cells: [rt('Média'), rt('Prix')] }), block('table_row', { cells: [rt('PPV 2'), rt('25 €')] })]),
      block('link_to_page', { type: 'page_id', page_id: 'abc' }),
      block('child_page', { title: 'PPV 2 – photos nue' }),
      block('divider', {}),
      block('image', {}),
    ])
    expect(text).toBe(
      [
        '## 🤝 Transition et qualification',
        '#1 — Transition de confiance',
        '> et du coup…',
        '⚠️ Si le fan n’est pas libre → script relationnel',
        '- 🔴 = mauvaise réponse',
        '  détail',
        '1. Ouverture',
        '| Média | Prix |',
        '| PPV 2 | 25 € |',
        '[page liée abc]',
        '[sous-page : PPV 2 – photos nue]',
        '---',
        '[image]',
      ].join('\n'),
    )
  })
})

describe('fetchNotionPage', () => {
  it('lit le titre puis tous les blocs (pagination, enfants), avec le jeton et la version d’API', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = []
    const answers: Record<string, unknown> = {
      'https://api.notion.com/v1/pages/p1': { properties: { title: { type: 'title', title: rt('Script de vente · Emma') } } },
      'https://api.notion.com/v1/blocks/p1/children?page_size=100': {
        results: [block('paragraph', { rich_text: rt('A') }), { id: 'q1', type: 'quote', has_children: true, quote: { rich_text: rt('B') } }],
        has_more: true,
        next_cursor: 'c2',
      },
      'https://api.notion.com/v1/blocks/p1/children?page_size=100&start_cursor=c2': {
        results: [block('paragraph', { rich_text: rt('D') })],
        has_more: false,
      },
      'https://api.notion.com/v1/blocks/q1/children?page_size=100': { results: [block('paragraph', { rich_text: rt('C') })], has_more: false },
    }
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> })
      if (!(url in answers)) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(answers[url]), { status: 200 })
    }) as typeof fetch
    expect(await fetchNotionPage('tok', 'p1', fake)).toEqual({ title: 'Script de vente · Emma', text: 'A\n> B\n  C\nD' })
    expect(seen[0]!.headers).toMatchObject({ Authorization: 'Bearer tok', 'Notion-Version': '2022-06-28' })
  })

  it('erreur HTTP Notion → message clair (page non partagée avec l’intégration)', async () => {
    const fake = (async () => new Response('{"code":"object_not_found"}', { status: 404 })) as typeof fetch
    await expect(fetchNotionPage('tok', 'p1', fake)).rejects.toThrow(
      'Notion 404 sur /v1/pages/p1 — page partagée avec l’intégration ? (Partager → Connexions)',
    )
  })
})

describe('listSharedPages', () => {
  const pageOf = (id: string, title: string, parent: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    object: 'page',
    id,
    parent,
    properties: { Nom: { type: 'title', title: rt(title) } },
    ...extra,
  })
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  it('toutes les pages partagées ET leurs sous-pages, en une recherche paginée, avec la page parente', async () => {
    const bodies: unknown[] = []
    const answers = [
      {
        results: [
          pageOf('r1', 'OUTILS MANAGERS', { type: 'workspace', workspace: true }),
          pageOf('s1', 'Script découverte (KYC) · Lucie', { type: 'page_id', page_id: 'r1' }),
        ],
        has_more: true,
        next_cursor: 'c2',
      },
      {
        results: [
          pageOf('d1', 'Ligne de base', { type: 'database_id', database_id: 'db' }),
          pageOf('k1', 'Dans une colonne', { type: 'block_id', block_id: 'b' }),
        ],
        has_more: false,
      },
    ]
    const fake = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.notion.com/v1/search')
      expect(init.method).toBe('POST')
      bodies.push(JSON.parse(init.body as string))
      return ok(answers.shift())
    }) as typeof fetch
    expect(await listSharedPages('tok', fake)).toEqual({
      pages: [
        { id: 'r1', title: 'OUTILS MANAGERS', parentId: null },
        { id: 's1', title: 'Script découverte (KYC) · Lucie', parentId: 'r1' },
        { id: 'd1', title: 'Ligne de base', parentId: null },
        { id: 'k1', title: 'Dans une colonne', parentId: null },
      ],
      truncated: false,
    })
    expect(bodies).toEqual([
      { filter: { property: 'object', value: 'page' }, page_size: 100 },
      { filter: { property: 'object', value: 'page' }, page_size: 100, start_cursor: 'c2' },
    ])
  })

  it('pages archivées ou à la corbeille ignorées', async () => {
    const fake = (async () =>
      ok({
        results: [
          pageOf('a', 'Gardée', { type: 'workspace', workspace: true }),
          pageOf('b', 'Archivée', { type: 'workspace', workspace: true }, { archived: true }),
          pageOf('c', 'Corbeille', { type: 'workspace', workspace: true }, { in_trash: true }),
        ],
        has_more: false,
      })) as typeof fetch
    expect((await listSharedPages('tok', fake)).pages.map((p) => p.id)).toEqual(['a'])
  })

  it('au-delà de 10 pages de résultats (1 000 pages) : arrêt, signalé tronqué', async () => {
    let calls = 0
    const fake = (async () => {
      calls++
      return ok({ results: [pageOf(`p${calls}`, 'P', { type: 'workspace', workspace: true })], has_more: true, next_cursor: `c${calls}` })
    }) as typeof fetch
    const r = await listSharedPages('tok', fake)
    expect(calls).toBe(10)
    expect(r.truncated).toBe(true)
  })

  it('Notion répond 429 → attend le délai demandé (Retry-After) puis réessaie', async () => {
    let calls = 0
    const fake = (async () => {
      calls++
      if (calls === 1) return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })
      return ok({ results: [pageOf('a', 'A', { type: 'workspace', workspace: true })], has_more: false })
    }) as typeof fetch
    expect((await listSharedPages('tok', fake)).pages).toEqual([{ id: 'a', title: 'A', parentId: null }])
    expect(calls).toBe(2)
  })

  it('429 persistant → abandon après 3 essais ; erreur HTTP → NotionError typée portant le statut', async () => {
    let calls = 0
    const busy = (async () => {
      calls++
      return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })
    }) as typeof fetch
    const err = await listSharedPages('tok', busy).catch((e: unknown) => e)
    expect(calls).toBe(3)
    expect(err).toBeInstanceOf(NotionError)
    expect((err as NotionError).status).toBe(429)
    const denied = await listSharedPages('tok', (async () => new Response('{}', { status: 401 })) as typeof fetch).catch((e: unknown) => e)
    expect((denied as NotionError).status).toBe(401)
  })
})
