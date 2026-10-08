import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  StudioError,
  createBranch,
  createMessage,
  createScript,
  editMessage,
  fetchStudio,
  listCollectionMedia,
  listCollections,
  mediaTitle,
  renameScript,
  saveLayout,
  setScriptActive,
} from './script-writer'

type Call = { url: string; init: RequestInit }
function stubFetch(...responses: Response[]): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const r = responses.shift()
      if (!r) throw new Error('réponse non prévue')
      return r
    }),
  )
  return calls
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const form = (init: RequestInit) => Object.fromEntries((init.body as FormData).entries())
const headers = (init: RequestInit) => init.headers as Record<string, string>

afterEach(() => vi.unstubAllGlobals())

describe('script-writer', () => {
  it('createScript : POST /scripts/new en FormData, en-têtes XHR + cookie, renvoie l’id', async () => {
    const calls = stubFetch(json({ id: '4242' }))
    expect(await createScript('sid=1', { name: 'S', description: '', ai_brief: '', is_sequence: '0', used_ratio: '' })).toBe(4242)
    expect(calls[0]!.url).toBe('https://mypuls.app/scripts/new')
    expect(calls[0]!.init.method).toBe('POST')
    expect(headers(calls[0]!.init)).toMatchObject({ Cookie: 'sid=1', 'X-Requested-With': 'XMLHttpRequest' })
    expect(form(calls[0]!.init)).toEqual({ name: 'S', description: '', ai_brief: '', is_sequence: '0', used_ratio: '' })
  })

  it('createScript sans id dans la réponse → erreur', async () => {
    stubFetch(json({}))
    await expect(createScript('c', { name: 'S' })).rejects.toThrow('POST /scripts/new : réponse sans id')
  })

  it('renameScript : POST /scripts/{id}/edit', async () => {
    const calls = stubFetch(new Response(null, { status: 204 }))
    await renameScript('c', 7, { name: '⚠️ INCOMPLET — S' })
    expect(calls[0]!.url).toBe('https://mypuls.app/scripts/7/edit')
    expect(form(calls[0]!.init)).toEqual({ name: '⚠️ INCOMPLET — S' })
  })

  it('setScriptActive : PATCH /scripts/{id}/toggle en JSON', async () => {
    const calls = stubFetch(json({ ok: true }))
    await setScriptActive('c', 7, false)
    expect(calls[0]!.url).toBe('https://mypuls.app/scripts/7/toggle')
    expect(calls[0]!.init.method).toBe('PATCH')
    expect(headers(calls[0]!.init)['Content-Type']).toBe('application/json')
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ isActive: false })
  })

  it('createBranch : POST /scripts/{id}/branches/new en JSON', async () => {
    const calls = stubFetch(json({ id: 3 }))
    await createBranch('c', 7, { label: 'Libre ?', paths: [{ label: 'Non', color: 'red' }] })
    expect(calls[0]!.url).toBe('https://mypuls.app/scripts/7/branches/new')
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ label: 'Libre ?', paths: [{ label: 'Non', color: 'red' }] })
  })

  it('createMessage : POST /scripts/{id}/messages/new, avec branch_id / branch_path dans un chemin', async () => {
    const calls = stubFetch(json({ id: 1 }), json({ id: 2 }))
    await createMessage('c', 7, { title: 't', content: 'x' })
    await createMessage('c', 7, { title: 't', content: 'y' }, { branchId: 3, pathId: 9 })
    expect(calls[0]!.url).toBe('https://mypuls.app/scripts/7/messages/new')
    expect(form(calls[0]!.init)).toEqual({ title: 't', content: 'x' })
    expect(form(calls[1]!.init)).toEqual({ title: 't', content: 'y', branch_id: '3', branch_path: '9' })
  })

  it('editMessage : POST /scripts/{id}/messages/{msgId}/edit en FormData — la route du Studio pour poser les relances', async () => {
    const calls = stubFetch(json({ id: 11 }))
    await editMessage('c', 7, 11, { title: 't', content: 'x', price: '0', medias_json: '[]', chain_delays_json: '[10,10]' })
    expect(calls[0]!.url).toBe('https://mypuls.app/scripts/7/messages/11/edit')
    expect(calls[0]!.init.method).toBe('POST')
    expect(form(calls[0]!.init)).toEqual({ title: 't', content: 'x', price: '0', medias_json: '[]', chain_delays_json: '[10,10]' })
  })

  // Réponses calquées sur la STRUCTURE relevée en lecture seule le 2026-10-08 (bibliothèque de Julie) :
  // /api/collections → { items: [{ id, name, count, counts, last_media_at }] } (sans curseur) ;
  // /api/collections/medias/{id} → { items: [{ id (nombre), type, duration, like, view, src, thumb,
  // posted_at, media_type, is_public, collection }], next_cursor } ; détail → { …, meta: { title, … } }.
  const media = (id: number, type: string) => ({
    id,
    type,
    duration: null,
    like: 0,
    view: 0,
    src: 'x',
    thumb: 'x',
    posted_at: 'x',
    media_type: type,
    is_public: false,
    collection: null,
  })
  it('bibliothèque : collections, médias d’une collection (toutes les pages), titre d’un média', async () => {
    const calls = stubFetch(
      json({ items: [{ id: 3367, name: 'Script-Chambre 2 🤍', count: 3, counts: { photo: 1, video: 1, audio: 1 }, last_media_at: 'x' }] }),
      json({ items: [media(101, 'photo'), media(102, 'video')], next_cursor: 'c2' }),
      json({ items: [media(103, 'audio')], next_cursor: null }),
      json({ id: 101, type: 'photo', meta: { title: 'PPV 1', description: null, tag: null, suggested_price: null } }),
      json({ id: 102, type: 'video', meta: null }),
    )
    expect(await listCollections('c')).toEqual([{ id: '3367', name: 'Script-Chambre 2 🤍' }])
    expect(await listCollectionMedia('c', '3367')).toEqual([
      { id: '101', type: 'photo' },
      { id: '102', type: 'video' },
      { id: '103', type: 'audio' },
    ])
    expect(await mediaTitle('c', '101')).toBe('PPV 1')
    expect(await mediaTitle('c', '102')).toBe('')
    expect(calls.map((c) => c.url)).toEqual([
      'https://mypuls.app/api/collections',
      'https://mypuls.app/api/collections/medias/3367?limit=50&with_audio=1',
      'https://mypuls.app/api/collections/medias/3367?limit=50&with_audio=1&cursor=c2',
      'https://mypuls.app/api/creator/media/101/detail',
      'https://mypuls.app/api/creator/media/102/detail',
    ])
  })

  it('bibliothèque : type absent → vide (jamais pris pour une photo) ; plus de 3 pages → erreur plutôt qu’un pack tronqué', async () => {
    stubFetch(json({ items: [{ id: 1 }], next_cursor: null }))
    expect(await listCollectionMedia('c', '9')).toEqual([{ id: '1', type: '' }])
    stubFetch(...[1, 2, 3].map((n) => json({ items: [media(n, 'photo')], next_cursor: `c${n}` })))
    await expect(listCollectionMedia('c', '9')).rejects.toThrow('collection 9 : plus de 3 pages de médias')
  })
  it('refus MyPuls : le texte `error` de la réponse est gardé dans l’erreur (sinon un 422 ne dit pas pourquoi)', async () => {
    stubFetch(json({ error: 'Relance invalide : aucun message ne suit.' }, 422))
    const err = await createMessage('c', 7, { title: 't', content: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StudioError)
    expect((err as StudioError).status).toBe(422)
    expect((err as Error).message).toBe('POST /scripts/7/messages/new 422 : Relance invalide : aucun message ne suit.')
    stubFetch(new Response('<html>', { status: 500 }))
    expect(((await createMessage('c', 7, { title: 't', content: 'x' }).catch((e: unknown) => e)) as Error).message).toBe(
      'POST /scripts/7/messages/new 500',
    )
  })

  it('fetchStudio : GET /scripts/{id}/studio → script, branches, messages', async () => {
    stubFetch(json({ script: { id: 7, name: 'S', isActive: false }, branches: [], messages: [], stats: {} }))
    expect(await fetchStudio('c', 7)).toEqual({ script: { id: 7, name: 'S', isActive: false }, branches: [], messages: [] })
  })

  it('fetchStudio : forme RÉELLE (capture scripts-2849, réduite à la structure) — ids d’embranchement et de chemin LOCAUX au script', async () => {
    // Capture `apps/ingestion/raw/pages/scripts-2849-studio.json` (gitignorée) : embranchement `id: 1`
    // avec `before` (id du message devant lequel il s'insère), chemins `id: 1..n` ; les messages d'un
    // chemin portent `branchId` / `branchPath` en ids LOCAUX. Textes remplacés par des neutres.
    stubFetch(
      json({
        script: { id: 2849, name: 'S', isActive: false },
        branches: [
          {
            id: 1,
            before: 34106,
            label: 'Question',
            paths: [
              { id: 1, label: 'Oui', color: 'green' },
              { id: 2, label: 'Plus tard', color: 'orange' },
            ],
          },
        ],
        messages: [
          { id: 124997, position: 12, title: 't', content: 'x', price: 0, medias: [], chainDelays: [], branchId: 1, branchPath: 1 },
          { id: 124998, position: 13, title: 't', content: 'x', price: 0, medias: [], chainDelays: [], branchId: 1, branchPath: 2 },
        ],
        stats: {},
      }),
    )
    const st = await fetchStudio('c', 2849)
    expect(st.branches).toEqual([
      {
        id: 1,
        label: 'Question',
        paths: [
          { id: 1, label: 'Oui', color: 'green' },
          { id: 2, label: 'Plus tard', color: 'orange' },
        ],
      },
    ])
    expect(st.messages.map((m) => [m.branchId, m.branchPath])).toEqual([
      [1, 1],
      [1, 2],
    ])
  })
  it('fetchStudio : ids en texte normalisés en nombres (le Studio fait Number() partout)', async () => {
    stubFetch(
      json({
        script: { id: '7', name: 'S', isActive: false },
        branches: [{ id: '1', before: '5', label: 'Libre ?', paths: [{ id: '2', label: 'Non', color: 'red' }] }],
        messages: [{ id: '11', position: 1, title: 't', content: 'x', price: 0, medias: [], chainDelays: [], branchId: '1', branchPath: '2' }],
      }),
    )
    const st = await fetchStudio('c', 7)
    expect(st.script.id).toBe(7)
    expect(st.branches).toEqual([{ id: 1, label: 'Libre ?', paths: [{ id: 2, label: 'Non', color: 'red' }] }])
    expect(st.messages[0]).toMatchObject({ id: 11, branchId: 1, branchPath: 2 })
  })

  it('saveLayout : PATCH /scripts/{id}/layout { items }', async () => {
    const calls = stubFetch(new Response(null, { status: 204 }))
    await saveLayout('c', 7, [
      { type: 'message', id: 1 },
      { type: 'branch', id: 3, paths: [{ id: 9, messages: [2] }] },
    ])
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      items: [
        { type: 'message', id: 1 },
        { type: 'branch', id: 3, paths: [{ id: 9, messages: [2] }] },
      ],
    })
  })

  it('statut HTTP en erreur → StudioError avec le statut (429 lu par l’appelant)', async () => {
    stubFetch(new Response('trop', { status: 429 }))
    const err = await createMessage('c', 7, { title: 't' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StudioError)
    expect((err as StudioError).status).toBe(429)
    expect((err as StudioError).message).toBe('POST /scripts/7/messages/new 429')
  })

  it('redirection (session expirée) → StudioError, sans suivre', async () => {
    const calls = stubFetch(new Response(null, { status: 302, headers: { Location: '/login' } }))
    await expect(setScriptActive('c', 7, false)).rejects.toThrow('PATCH /scripts/7/toggle : redirection 302 (session expirée ?)')
    expect(calls[0]!.init.redirect).toBe('manual')
  })
})
