import { describe, expect, it } from 'vitest'
import { blocksToText, fetchNotionPage, listNotionScripts, listSharedTopPages, notionPageId, type NotionBlock } from './notion'

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

describe('listSharedTopPages', () => {
  it('pages partagées de premier niveau (parent = espace), via la recherche, pagination comprise', async () => {
    const bodies: unknown[] = []
    const pageOf = (id: string, title: string, parent: Record<string, unknown>) => ({
      object: 'page',
      id,
      parent,
      properties: { title: { type: 'title', title: rt(title) } },
    })
    const answers = [
      {
        results: [pageOf('r1', 'Agence', { type: 'workspace', workspace: true }), pageOf('x1', 'EMMA', { type: 'page_id', page_id: 'r1' })],
        has_more: true,
        next_cursor: 'c2',
      },
      { results: [pageOf('r2', 'Brouillons', { type: 'workspace', workspace: true })], has_more: false },
    ]
    const fake = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.notion.com/v1/search')
      expect(init.method).toBe('POST')
      bodies.push(JSON.parse(init.body as string))
      return new Response(JSON.stringify(answers.shift()), { status: 200 })
    }) as typeof fetch
    expect(await listSharedTopPages('tok', fake)).toEqual([
      { id: 'r1', title: 'Agence' },
      { id: 'r2', title: 'Brouillons' },
    ])
    expect(bodies).toEqual([
      { filter: { property: 'object', value: 'page' }, page_size: 100 },
      { filter: { property: 'object', value: 'page' }, page_size: 100, start_cursor: 'c2' },
    ])
  })
})

describe('listNotionScripts', () => {
  const page = (id: string, title: string) => ({ id, type: 'child_page', has_children: true, child_page: { title } })
  it('racine → dossiers (sous-pages) → scripts (sous-pages), pagination comprise ; le reste est ignoré', async () => {
    const answers: Record<string, unknown> = {
      'https://api.notion.com/v1/blocks/root/children?page_size=100': {
        results: [page('f1', 'EMMA'), block('paragraph', { rich_text: rt('intro') }), page('f2', 'OUTILS MANAGERS')],
        has_more: false,
      },
      'https://api.notion.com/v1/blocks/f1/children?page_size=100': {
        results: [page('s1', 'Script de vente · Soirée révisions')],
        has_more: true,
        next_cursor: 'c2',
      },
      'https://api.notion.com/v1/blocks/f1/children?page_size=100&start_cursor=c2': { results: [page('s2', 'KYC')], has_more: false },
      'https://api.notion.com/v1/blocks/f2/children?page_size=100': { results: [page('p1', 'Prompt – Script de vente V3')], has_more: false },
    }
    const fake = (async (url: string) =>
      url in answers ? new Response(JSON.stringify(answers[url]), { status: 200 }) : new Response('{}', { status: 404 })) as typeof fetch
    expect(await listNotionScripts('tok', 'root', fake)).toEqual([
      { id: 'f1', title: 'EMMA', scripts: [{ id: 's1', title: 'Script de vente · Soirée révisions' }, { id: 's2', title: 'KYC' }] },
      { id: 'f2', title: 'OUTILS MANAGERS', scripts: [{ id: 'p1', title: 'Prompt – Script de vente V3' }] },
    ])
  })
  it('jamais plus de 3 requêtes Notion à la fois (≈ 3 req/s par intégration), même avec 12 dossiers', async () => {
    const folders = Array.from({ length: 12 }, (_, i) => page(`f${i}`, `Modèle ${i}`))
    let inFlight = 0
    let peak = 0
    const fake = (async (url: string) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      const results = url.includes('/blocks/root/') ? folders : []
      return new Response(JSON.stringify({ results, has_more: false }), { status: 200 })
    }) as typeof fetch
    expect(await listNotionScripts('tok', 'root', fake)).toHaveLength(12)
    expect(peak).toBeLessThanOrEqual(3)
  })
  it('Notion répond 429 → attend le délai demandé (Retry-After) puis réessaie', async () => {
    let calls = 0
    const fake = (async () => {
      calls++
      if (calls === 1) return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })
      return new Response(JSON.stringify({ results: [page('f1', 'EMMA')], has_more: false }), { status: 200 })
    }) as typeof fetch
    const out = await listNotionScripts('tok', 'root', (async (url: string, init?: RequestInit) =>
      url.includes('/blocks/root/') ? fake(url, init) : new Response(JSON.stringify({ results: [], has_more: false }), { status: 200 })) as typeof fetch)
    expect(out).toEqual([{ id: 'f1', title: 'EMMA', scripts: [] }])
    expect(calls).toBe(2)
  })
  it('429 persistant → abandon après 3 essais, message clair', async () => {
    let calls = 0
    const fake = (async () => {
      calls++
      return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })
    }) as typeof fetch
    await expect(listNotionScripts('tok', 'root', fake)).rejects.toThrow('Notion 429')
    expect(calls).toBe(3)
  })
  it('racine non partagée → message clair', async () => {
    const fake = (async () => new Response('{}', { status: 404 })) as typeof fetch
    await expect(listNotionScripts('tok', 'root', fake)).rejects.toThrow(
      'Notion 404 sur /v1/blocks/root/children — page partagée avec l’intégration ? (Partager → Connexions)',
    )
  })
})
