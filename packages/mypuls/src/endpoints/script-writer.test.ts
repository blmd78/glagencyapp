import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  StudioError,
  createBranch,
  createMessage,
  createScript,
  fetchStudio,
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

  it('fetchStudio : GET /scripts/{id}/studio → script, branches, messages', async () => {
    stubFetch(json({ script: { id: 7, name: 'S', isActive: false }, branches: [], messages: [], stats: {} }))
    expect(await fetchStudio('c', 7)).toEqual({ script: { id: 7, name: 'S', isActive: false }, branches: [], messages: [] })
  })

  it('fetchStudio : ids normalisés en nombres (le Studio fait Number() partout, la forme réelle des branches n’est pas capturée)', async () => {
    stubFetch(
      json({
        script: { id: '7', name: 'S', isActive: false },
        branches: [{ id: '3', label: 'Libre ?', paths: [{ id: '9', label: 'Non', color: 'red' }] }],
        messages: [{ id: '11', position: 1, title: 't', content: 'x', price: 0, medias: [], chainDelays: [], branchId: '3', branchPath: '9' }],
      }),
    )
    const st = await fetchStudio('c', 7)
    expect(st.script.id).toBe(7)
    expect(st.branches).toEqual([{ id: 3, label: 'Libre ?', paths: [{ id: 9, label: 'Non', color: 'red' }] }])
    expect(st.messages[0]).toMatchObject({ id: 11, branchId: 3, branchPath: 9 })
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
