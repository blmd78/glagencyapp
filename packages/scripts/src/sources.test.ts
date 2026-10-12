import { describe, expect, it } from 'vitest'
import { NotionError, type NotionBlock } from './notion'
import { SOURCE_LIMITS, gatherScript } from './sources'

// Pages et fichiers factices, au format de l'API Notion — aucun texte réel d'une modèle.
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const MAIN = id(1)
const S3 = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/space/file/Script.pdf?X-Amz-Signature=abc'
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 script')

let seq = 0
const rt = (plain_text: string, extra: Record<string, unknown> = {}) => [{ plain_text, ...extra }]
const block = (type: string, data: Record<string, unknown>, extra: Partial<NotionBlock> = {}): NotionBlock =>
  ({ id: `b-${seq++}`, type, has_children: false, [type]: data, ...extra }) as NotionBlock
const para = (text: string) => block('paragraph', { rich_text: rt(text) })
const mention = (title: string, pageId: string) =>
  block('paragraph', { rich_text: [{ plain_text: '- Script complet : ', href: null }, ...rt(title, { type: 'mention', mention: { type: 'page', page: { id: pageId } }, href: `https://www.notion.so/${pageId.replace(/-/g, '')}` })] })
const hostedPdf = (name: string, url = S3) => block('pdf', { type: 'file', file: { url }, name })

type Route = { status?: number; body?: ConstructorParameters<typeof Response>[0]; headers?: Record<string, string> }
function fakeNotion(pages: Record<string, { title: string; blocks: NotionBlock[]; trashed?: boolean; status?: number }>, files: Record<string, Route> = {}) {
  const calls: Array<{ url: string; auth: string | null }> = []
  const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('Authorization')
    calls.push({ url, auth })
    const m = /\/v1\/(pages|blocks)\/([^/?]+)/.exec(url)
    if (m) {
      const page = pages[m[2]!]
      if (!page || page.status) return new Response('{}', { status: page?.status ?? 404 })
      if (m[1] === 'pages') {
        return Response.json({ in_trash: !!page.trashed, properties: { title: { type: 'title', title: rt(page.title) } } })
      }
      return Response.json({ results: page.blocks, has_more: false })
    }
    const f = files[url]
    if (!f) return new Response('introuvable', { status: 404 })
    return new Response(f.body ?? '', { status: f.status ?? 200, headers: f.headers })
  }) as typeof fetch
  return { fetchFn, calls }
}

describe('gatherScript', () => {
  it('page de référence : lit le PDF hébergé et la page liée, écarte le prompt sans le lire, signale l’introuvable', async () => {
    const { fetchFn, calls } = fakeNotion(
      {
        [MAIN]: {
          title: 'Script de vente · Emma',
          blocks: [para('💡 Script de référence à donner à Claude.'), hostedPdf('Script_de_vente_V2.pdf'), mention('Script complet', id(2)), mention('Prompt – Script de vente V2', id(3)), mention('Ancien script', id(4))],
        },
        [id(2)]: { title: 'Script complet', blocks: [block('quote', { rich_text: rt('et du coup…') })] },
        [id(3)]: { title: 'Prompt – Script de vente V2', blocks: [para('Tu es un expert…')] },
      },
      { [S3]: { body: PDF_BYTES, headers: { 'content-type': 'application/pdf' } } },
    )
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.title).toBe('Script de vente · Emma')
    expect(g.pdfs).toEqual([{ name: 'Script_de_vente_V2.pdf', data: Buffer.from(PDF_BYTES).toString('base64') }])
    expect(g.text).toContain('[pdf : Script_de_vente_V2.pdf]')
    expect(g.text).toContain('=== Page liée « Script complet » ===\n> et du coup…')
    expect(g.text).not.toContain('Tu es un expert')
    expect(g.sources).toEqual([
      { kind: 'page', label: 'Script de vente · Emma', status: 'lu', reason: null },
      { kind: 'pdf', label: 'Script_de_vente_V2.pdf', status: 'lu', reason: null },
      // Dans l'ordre de la page.
      { kind: 'page liée', label: 'Script complet', status: 'lu', reason: null },
      { kind: 'page liée', label: 'Prompt – Script de vente V2', status: 'non lu', reason: 'prompt : des consignes de rédaction, pas un script' },
      { kind: 'page liée', label: 'Ancien script', status: 'non lu', reason: 'page introuvable, ou non partagée avec le CRM (Partager → Connexions → GL Agency CRM)' },
    ])
    // Le prompt n'est jamais ouvert ; le PDF se télécharge SANS la clé Notion.
    expect(calls.some((c) => c.url.includes(id(3)))).toBe(false)
    expect(calls.find((c) => c.url === S3)?.auth).toBeNull()
  })

  it('sous-pages : lues jusqu’au plafond, la suite signalée', async () => {
    const subs = Array.from({ length: SOURCE_LIMITS.pages + 2 }, (_, i) => block('child_page', { title: `PPV ${i + 1} – 10 €` }, { id: id(100 + i) }))
    const pages: Parameters<typeof fakeNotion>[0] = { [MAIN]: { title: 'Script', blocks: subs } }
    subs.forEach((b, i) => (pages[b.id] = { title: `PPV ${i + 1} – 10 €`, blocks: [para(`prix ${10 + i} €`)] }))
    const g = await gatherScript('secret', MAIN, fakeNotion(pages).fetchFn)
    expect(g.sources.filter((s) => s.kind === 'sous-page' && s.status === 'lu')).toHaveLength(SOURCE_LIMITS.pages)
    expect(g.sources.filter((s) => s.reason === `plafond de ${SOURCE_LIMITS.pages} pages atteint`).map((s) => s.label)).toEqual(['PPV 11 – 10 €', 'PPV 12 – 10 €'])
    expect(g.text).toContain('=== Sous-page « PPV 1 – 10 € » ===\nprix 10 €')
  })

  it('images, vidéos, bases et sites externes : listés non lus, jamais téléchargés', async () => {
    const { fetchFn, calls } = fakeNotion({
      [MAIN]: {
        title: 'Script',
        blocks: [
          block('image', { type: 'file', file: { url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/x/photo.jpg' } }),
          block('video', { type: 'external', external: { url: 'https://youtu.be/x' } }),
          block('child_database', { title: 'Médias' }),
          block('bookmark', { url: 'https://www.canva.com/design/abc', caption: [] }),
        ],
      },
    })
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.sources.slice(1).map((s) => [s.kind, s.status, s.reason])).toEqual([
      ['image', 'non lu', 'image : jamais envoyée à la conversion'],
      ['vidéo', 'non lu', 'vidéo : non lue'],
      ['base', 'non lu', 'base de données : non lue'],
      ['lien', 'non lu', 'site externe : non lu (coller le texte dans la page)'],
    ])
    expect(calls.map((c) => c.url).filter((u) => !u.includes('api.notion.com'))).toEqual([])
  })

  it('Google Doc public : texte lu par l’export ; privé (page de connexion) : signalé', async () => {
    const pub = 'https://docs.google.com/document/d/AAAAAAAAAAAAAAA/edit'
    const priv = 'https://docs.google.com/document/d/BBBBBBBBBBBBBBB/edit?usp=sharing'
    const { fetchFn } = fakeNotion(
      { [MAIN]: { title: 'Script', blocks: [block('paragraph', { rich_text: [{ plain_text: 'script complet', href: pub }, { plain_text: 'brouillon', href: priv }] })] } },
      {
        'https://docs.google.com/document/d/AAAAAAAAAAAAAAA/export?format=txt': { body: '#1 — Transition\n> et du coup…', headers: { 'content-type': 'text/plain; charset=utf-8' } },
        'https://docs.google.com/document/d/BBBBBBBBBBBBBBB/export?format=txt': { body: '<html>Connexion</html>', headers: { 'content-type': 'text/html' } },
      },
    )
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.text).toContain('=== Google Doc « script complet » ===\n#1 — Transition\n> et du coup…')
    expect(g.sources.slice(1)).toEqual([
      { kind: 'google doc', label: 'script complet', status: 'lu', reason: null },
      { kind: 'google doc', label: 'brouillon', status: 'non lu', reason: 'privé ou illisible : le partager à « tous ceux qui ont le lien », ou coller le texte dans la page' },
    ])
  })

  it('PDF trop lourd, qui n’en est pas un, ou hors de l’hébergement Notion : signalé, jamais joint', async () => {
    const big = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/x/gros.pdf'
    const fake = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/x/faux.pdf'
    const { fetchFn, calls } = fakeNotion(
      { [MAIN]: { title: 'Script', blocks: [hostedPdf('gros.pdf', big), hostedPdf('faux.pdf', fake), hostedPdf('ailleurs.pdf', 'https://exemple.com/a.pdf')] } },
      {
        [big]: { body: PDF_BYTES, headers: { 'content-length': String(SOURCE_LIMITS.pdfBytes + 1) } },
        [fake]: { body: '<html>pas un pdf</html>' },
      },
    )
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.pdfs).toEqual([])
    expect(g.sources.slice(1).map((s) => s.reason)).toEqual(['trop lourd (plus de 20 Mo disponibles)', 'ce n’est pas un PDF', 'adresse de fichier inattendue'])
    expect(calls.some((c) => c.url.startsWith('https://exemple.com'))).toBe(false)
  })

  it('mentions et liens dans un tableau, lien interne en adresse relative : suivis comme les autres', async () => {
    const { fetchFn } = fakeNotion({
      [MAIN]: {
        title: 'Script',
        blocks: [
          block('table', {}, { id: 'tbl', has_children: true }),
          block('paragraph', { rich_text: [{ plain_text: 'relance', href: `/${id(3).replace(/-/g, '')}` }] }),
        ],
      },
      // Les lignes d'un tableau sont ses enfants, lus par l'API comme ceux de tout bloc.
      tbl: { title: '', blocks: [block('table_row', { cells: [rt('Média'), [{ plain_text: 'PPV 2', type: 'mention', mention: { type: 'page', page: { id: id(2) } } }]] })] },
      [id(2)]: { title: 'PPV 2 – 25 €', blocks: [para('prix 25 €')] },
      [id(3)]: { title: 'Relance', blocks: [block('quote', { rich_text: rt('t’as pas osé ?') })] },
    })
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.sources.slice(1).map((s) => [s.label, s.status])).toEqual([
      ['PPV 2 – 25 €', 'lu'],
      ['Relance', 'lu'],
    ])
  })

  it('Google Doc : lu une seule fois (« /edit » et « ?usp=sharing »), borné à la place qui reste', async () => {
    const a = 'https://docs.google.com/document/d/AAAAAAAAAAAAAAA/edit'
    const b = 'https://docs.google.com/document/d/AAAAAAAAAAAAAAA/edit?usp=sharing'
    const exportUrl = 'https://docs.google.com/document/d/AAAAAAAAAAAAAAA/export?format=txt'
    const { fetchFn, calls } = fakeNotion(
      { [MAIN]: { title: 'Script', blocks: [para('x'.repeat(SOURCE_LIMITS.textChars - 100)), block('paragraph', { rich_text: [{ plain_text: 'doc', href: a }, { plain_text: 'doc bis', href: b }] })] } },
      { [exportUrl]: { body: 'y'.repeat(10_000), headers: { 'content-type': 'text/plain' } } },
    )
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(calls.filter((c) => c.url === exportUrl)).toHaveLength(1)
    expect(g.text.length).toBeLessThanOrEqual(SOURCE_LIMITS.textChars)
    const doc = g.sources.find((s) => s.kind === 'google doc')!
    expect(doc.status).toBe('non lu')
    expect(doc.reason).toMatch(/^lu en partie : coupé à \d+ caractères$/)
  })

  it('Google Doc collé au format d’export : lu ; coupé en caractères (ASCII) : dit « lu en partie »', async () => {
    const exportUrl = 'https://docs.google.com/document/d/CCCCCCCCCCCCCCC/export?format=txt'
    const { fetchFn } = fakeNotion(
      { [MAIN]: { title: 'Script', blocks: [block('paragraph', { rich_text: [{ plain_text: 'doc', href: exportUrl }] })] } },
      { [exportUrl]: { body: 'z'.repeat(SOURCE_LIMITS.textChars + 50_000), headers: { 'content-type': 'text/plain' } } },
    )
    const g = await gatherScript('secret', MAIN, fetchFn)
    const doc = g.sources.find((s) => s.kind === 'google doc')!
    expect(doc.status).toBe('non lu')
    expect(doc.reason).toMatch(/^lu en partie/)
    expect(g.text.length).toBeLessThanOrEqual(SOURCE_LIMITS.textChars)
  })

  it('chaque téléchargement porte une échéance (requête et lecture du corps)', async () => {
    const signals: unknown[] = []
    const { fetchFn: base } = fakeNotion({ [MAIN]: { title: 'Script', blocks: [hostedPdf('Script.pdf')] } }, { [S3]: { body: PDF_BYTES } })
    const fetchFn = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input) === S3) signals.push(init?.signal)
      return base(input, init)
    }) as typeof fetch
    await gatherScript('secret', MAIN, fetchFn)
    expect(signals).toHaveLength(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })

  it('coupure du flux pendant un PDF : ce PDF seul est signalé, la préparation continue', async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(PDF_BYTES)
        c.error(new Error('connexion perdue'))
      },
    })
    const { fetchFn } = fakeNotion({ [MAIN]: { title: 'Script', blocks: [para('> coucou'), hostedPdf('Script.pdf')] } }, { [S3]: { body: broken } })
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.pdfs).toEqual([])
    expect(g.sources[1]).toEqual({ kind: 'pdf', label: 'Script.pdf', status: 'non lu', reason: 'téléchargement interrompu ou trop long' })
  })

  it('page liée : ses images et liens externes sont rapportés, regroupés ; ses propres pages ne sont pas lues', async () => {
    const { fetchFn, calls } = fakeNotion({
      [MAIN]: { title: 'Script', blocks: [block('link_to_page', { type: 'page_id', page_id: id(2) })] },
      [id(2)]: {
        title: 'PPV 2 – 25 €',
        blocks: [
          block('image', { type: 'file', file: { url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/x/a.jpg' } }),
          block('image', { type: 'file', file: { url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/x/b.jpg' } }),
          block('bookmark', { url: 'https://www.canva.com/design/abc', caption: [] }),
          block('child_page', { title: 'Variante' }, { id: id(5) }),
        ],
      },
    })
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.sources.slice(2).map((s) => [s.kind, s.label, s.reason])).toEqual([
      ['image', 'PPV 2 – 25 € ×2', 'image : jamais envoyée à la conversion'],
      ['lien', 'PPV 2 – 25 €', 'site externe : non lu (coller le texte dans la page)'],
      ['sous-page', 'PPV 2 – 25 €', 'citée par une page liée : non lue (un seul niveau)'],
    ])
    expect(calls.some((c) => c.url.includes(id(5)))).toBe(false)
  })

  it('page liée à la corbeille : écartée ; clé expirée : toute la lecture s’arrête', async () => {
    const trashed = fakeNotion({
      [MAIN]: { title: 'Script', blocks: [block('link_to_page', { type: 'page_id', page_id: id(2) })] },
      [id(2)]: { title: 'Vieux script', blocks: [para('> coucou')], trashed: true },
    })
    const g = await gatherScript('secret', MAIN, trashed.fetchFn)
    expect(g.sources[1]).toEqual({ kind: 'page liée', label: 'Vieux script', status: 'non lu', reason: 'page à la corbeille' })
    expect(g.text).not.toContain('coucou')
    // Ses blocs ne sont pas lus pour rien.
    expect(trashed.calls.some((c) => c.url.includes(`/blocks/${id(2)}`))).toBe(false)

    const expired = fakeNotion({
      [MAIN]: { title: 'Script', blocks: [block('link_to_page', { type: 'page_id', page_id: id(2) })] },
      [id(2)]: { title: 'x', blocks: [], status: 401 },
    })
    await expect(gatherScript('secret', MAIN, expired.fetchFn)).rejects.toBeInstanceOf(NotionError)
  })

  it('texte démesuré : coupé au plafond, et dit', async () => {
    const { fetchFn } = fakeNotion({ [MAIN]: { title: 'Script', blocks: [para('x'.repeat(SOURCE_LIMITS.textChars + 10))] } })
    const g = await gatherScript('secret', MAIN, fetchFn)
    expect(g.text).toHaveLength(SOURCE_LIMITS.textChars)
    expect(g.sources.at(-1)).toEqual({ kind: 'page', label: 'fin du texte', status: 'non lu', reason: `texte coupé à ${SOURCE_LIMITS.textChars} caractères` })
  })
})
