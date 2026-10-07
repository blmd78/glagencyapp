/**
 * Lecture d'une page Notion (API REST officielle, intégration interne `NOTION_TOKEN`) rendue en
 * texte proche du Markdown : c'est l'entrée de la conversion par Claude, pas un rendu fidèle. On garde
 * ce qui porte le script (titres, bulles en citation, encadrés et leurs emojis, listes, tableaux,
 * liens de pages) et on signale le reste par un repère (`[image]`) sans le perdre en silence.
 */
const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

type RichText = Array<{ plain_text: string }>
export interface NotionBlock {
  id: string
  type: string
  has_children: boolean
  children?: NotionBlock[]
  [key: string]: unknown
}

export function notionPageId(input: string): string {
  const hex = input.replace(/-/g, '').match(/[0-9a-f]{32}(?![0-9a-f])/i)?.[0]
  if (!hex) throw new Error(`lien Notion sans id de page : ${input}`)
  const h = hex.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const plain = (r: unknown): string => (Array.isArray(r) ? (r as RichText).map((t) => t.plain_text).join('') : '')

function blockLine(b: NotionBlock, n: number): string {
  const d = (b[b.type] ?? {}) as Record<string, unknown>
  const text = plain(d.rich_text)
  switch (b.type) {
    case 'heading_1':
      return `# ${text}`
    case 'heading_2':
      return `## ${text}`
    case 'heading_3':
      return `### ${text}`
    case 'quote':
      return `> ${text}`
    case 'callout': {
      const emoji = (d.icon as { emoji?: string } | undefined)?.emoji
      return emoji ? `${emoji} ${text}` : text
    }
    case 'bulleted_list_item':
      return `- ${text}`
    case 'numbered_list_item':
      return `${n}. ${text}`
    case 'to_do':
      return `[${d.checked ? 'x' : ' '}] ${text}`
    case 'table_row':
      return `| ${((d.cells as unknown[] | undefined) ?? []).map(plain).join(' | ')} |`
    case 'link_to_page':
      return `[page liée ${String(d.page_id ?? d.database_id ?? '')}]`
    case 'child_page':
      return `[sous-page : ${String(d.title ?? '')}]`
    case 'child_database':
      return `[base : ${String(d.title ?? '')}]`
    case 'divider':
      return '---'
    case 'table':
      return ''
    case 'paragraph':
    case 'toggle':
    case 'code':
      return text
    default:
      return text || `[${b.type}]`
  }
}

export function blocksToText(blocks: NotionBlock[], depth = 0): string {
  const pad = '  '.repeat(depth)
  const out: string[] = []
  let n = 0
  for (const b of blocks) {
    n = b.type === 'numbered_list_item' ? n + 1 : 0
    const line = blockLine(b, n)
    // Un tableau n'a pas de ligne à lui : ses lignes sont au même niveau que lui.
    const childDepth = b.type === 'table' ? depth : depth + 1
    if (line) out.push(pad + line)
    if (b.children?.length) out.push(blocksToText(b.children, childDepth))
  }
  return out.filter((l) => l !== '').join('\n')
}

/** Notion limite à ~3 requêtes/s par intégration : sur un 429, on attend `Retry-After` puis on réessaie. */
const NOTION_ATTEMPTS = 3
const NOTION_CONCURRENCY = 3

async function notionFetch(url: string, init: RequestInit, fetchFn: typeof fetch): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchFn(url, init)
    if (res.status !== 429 || attempt >= NOTION_ATTEMPTS) return res
    const header = res.headers.get('Retry-After')
    const seconds = header === null || !Number.isFinite(Number(header)) ? 1 : Math.min(Math.max(Number(header), 0), 30)
    await new Promise((r) => setTimeout(r, seconds * 1000))
  }
}

/** `fn` sur chaque élément, `limit` à la fois, ordre conservé. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function notionGet(token: string, path: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await notionFetch(`${NOTION_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
  }, fetchFn)
  if (!res.ok) throw new Error(`Notion ${res.status} sur /v1${path.split('?')[0]} — page partagée avec l’intégration ? (Partager → Connexions)`)
  return res.json()
}

/** Enfants directs d'un bloc, toutes les pages de résultats (100 par appel). */
async function listChildren(token: string, id: string, fetchFn: typeof fetch): Promise<NotionBlock[]> {
  const out: NotionBlock[] = []
  let cursor: string | null = null
  do {
    const q: string = cursor ? `&start_cursor=${cursor}` : ''
    const page = (await notionGet(token, `/blocks/${id}/children?page_size=100${q}`, fetchFn)) as {
      results: NotionBlock[]
      has_more: boolean
      next_cursor?: string | null
    }
    out.push(...page.results)
    cursor = page.has_more ? (page.next_cursor ?? null) : null
  } while (cursor)
  return out
}

async function children(token: string, id: string, fetchFn: typeof fetch): Promise<NotionBlock[]> {
  const out = await listChildren(token, id, fetchFn)
  // Les sous-pages ne sont pas descendues : ce sont d'autres documents (pages média, dossiers).
  for (const b of out) {
    if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') b.children = await children(token, b.id, fetchFn)
  }
  return out
}

/**
 * Pages partagées avec la connexion et posées à la RACINE de l'espace (parent = workspace) : les
 * candidates « page racine » que l'admin confirme après « Connecter Notion ».
 */
export async function listSharedTopPages(token: string, fetchFn: typeof fetch = fetch): Promise<Array<{ id: string; title: string }>> {
  const out: Array<{ id: string; title: string }> = []
  let cursor: string | null = null
  do {
    const body: Record<string, unknown> = { filter: { property: 'object', value: 'page' }, page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = await notionFetch(`${NOTION_API}/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, fetchFn)
    if (!res.ok) throw new Error(`Notion ${res.status} sur /v1/search`)
    const page = (await res.json()) as {
      results: Array<{ id: string; parent?: { type?: string }; properties?: Record<string, { type: string; title?: unknown }> }>
      has_more: boolean
      next_cursor?: string | null
    }
    for (const p of page.results) {
      if (p.parent?.type !== 'workspace') continue
      const titleProp = Object.values(p.properties ?? {}).find((x) => x.type === 'title')
      out.push({ id: p.id, title: plain(titleProp?.title) })
    }
    cursor = page.has_more ? (page.next_cursor ?? null) : null
  } while (cursor)
  return out
}

export type NotionFolder = { id: string; title: string; scripts: Array<{ id: string; title: string }> }

/**
 * Notion d'agence : la racine contient un dossier par modèle (et OUTILS MANAGERS) ; chaque dossier
 * contient les scripts en sous-pages. Deux niveaux, pas plus — les pages média sous un script ne
 * sont pas des scripts.
 */
export async function listNotionScripts(token: string, rootId: string, fetchFn: typeof fetch = fetch): Promise<NotionFolder[]> {
  const pages = (blocks: NotionBlock[]) =>
    blocks
      .filter((b) => b.type === 'child_page')
      .map((b) => ({ id: b.id, title: String((b.child_page as { title?: string } | undefined)?.title ?? '') }))
  const folders = pages(await listChildren(token, rootId, fetchFn))
  return mapLimit(folders, NOTION_CONCURRENCY, async (f) => ({ ...f, scripts: pages(await listChildren(token, f.id, fetchFn)) }))
}

export async function fetchNotionPage(
  token: string,
  pageId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ title: string; text: string }> {
  const page = (await notionGet(token, `/pages/${pageId}`, fetchFn)) as { properties: Record<string, { type: string; title?: unknown }> }
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title')
  return { title: plain(titleProp?.title), text: blocksToText(await children(token, pageId, fetchFn)) }
}
