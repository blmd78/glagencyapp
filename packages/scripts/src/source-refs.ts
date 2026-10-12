import { blockFile, notionPageId, plain, type NotionBlock, type RichText } from './notion'

/**
 * Ce que citent les blocs d'une page Notion — fichiers, pages, liens — pour `gatherScript` (sources.ts).
 * Pur : rien n'est téléchargé ici.
 */
export type SourceKind = 'page' | 'page liée' | 'sous-page' | 'pdf' | 'google doc' | 'google drive' | 'lien' | 'image' | 'vidéo' | 'audio' | 'fichier' | 'base'

// Fichiers hébergés par Notion : l'API renvoie une adresse signée sur l'un de ces domaines.
export const NOTION_FILE_HOST = /(^|\.)(amazonaws\.com|notion\.so|notion-static\.com|notionusercontent\.com)$/
const NOTION_HOST = /(^|\.)(notion\.so|notion\.site|notion\.com)$/
export const GDOC = /^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{10,})/
export const GDRIVE = /^https:\/\/drive\.google\.com\/(?:file\/d\/([A-Za-z0-9_-]{10,})|open\?id=([A-Za-z0-9_-]{10,}))/

export type Ref =
  | { kind: 'page'; id: string; via: 'page liée' | 'sous-page'; title: string | null }
  | { kind: 'pdf'; url: string; name: string }
  | { kind: 'url'; url: string; label: string }
  | { kind: 'skip'; source: SourceKind; label: string; reason: string }

export const hostOf = (url: string): string | null => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.hostname : null
  } catch {
    return null
  }
}

/** Page Notion citée par une adresse (`notion.so/…-<id>`), ou `null`. */
function notionLink(url: string): string | null {
  const host = hostOf(url)
  if (!host || !NOTION_HOST.test(host)) return null
  try {
    return notionPageId(url)
  } catch {
    return null
  }
}

function linkRef(href: string, label: string): Ref {
  // L'API rend un lien vers une page de l'espace en adresse relative (« /<id> ») : elle vise Notion.
  const url = href.startsWith('/') ? `https://www.notion.so${href}` : href
  const page = notionLink(url)
  return page ? { kind: 'page', id: page, via: 'page liée', title: null } : { kind: 'url', url, label: label || url }
}

/** Mentions « @page » et liens du texte riche. */
function richRefs(r: unknown, out: Ref[]): void {
  if (!Array.isArray(r)) return
  for (const t of r as RichText) {
    const pageId = t.type === 'mention' && t.mention?.type === 'page' ? t.mention.page?.id : undefined
    // Le texte d'une mention est le titre de la page citée : il suffit à écarter un prompt sans le lire.
    if (pageId) out.push({ kind: 'page', id: pageId, via: 'page liée', title: t.plain_text || null })
    else if (t.href) out.push(linkRef(t.href, t.plain_text))
  }
}

/** Ce que citent les blocs (récursif sur les enfants déjà lus : bascules, colonnes, listes). */
export function blockRefs(blocks: NotionBlock[], out: Ref[] = []): Ref[] {
  for (const b of blocks) {
    const d = (b[b.type] ?? {}) as Record<string, unknown>
    richRefs(d.rich_text, out)
    switch (b.type) {
      case 'pdf':
      case 'file': {
        const f = blockFile(d)
        if (!f) break
        const isPdf = b.type === 'pdf' || /\.pdf$/i.test(f.name)
        if (!isPdf) out.push({ kind: 'skip', source: 'fichier', label: f.name, reason: 'fichier qui n’est pas un PDF' })
        else if (f.hosted) out.push({ kind: 'pdf', url: f.url, name: f.name })
        else out.push(linkRef(f.url, f.name))
        break
      }
      case 'table_row':
        // Les cellules d'un tableau sont du texte riche : leurs mentions et liens comptent aussi.
        for (const cell of (d.cells as unknown[] | undefined) ?? []) richRefs(cell, out)
        break
      case 'image':
        out.push({ kind: 'skip', source: 'image', label: blockFile(d)?.name ?? 'image', reason: 'image : jamais envoyée à la conversion' })
        break
      case 'video':
        out.push({ kind: 'skip', source: 'vidéo', label: blockFile(d)?.name ?? 'vidéo', reason: 'vidéo : non lue' })
        break
      case 'audio':
        out.push({ kind: 'skip', source: 'audio', label: blockFile(d)?.name ?? 'audio', reason: 'audio : non lu' })
        break
      case 'link_to_page':
        if (typeof d.page_id === 'string') out.push({ kind: 'page', id: d.page_id, via: 'page liée', title: null })
        else out.push({ kind: 'skip', source: 'base', label: 'base de données liée', reason: 'base de données : non lue' })
        break
      case 'child_page':
        out.push({ kind: 'page', id: b.id, via: 'sous-page', title: typeof d.title === 'string' ? d.title : null })
        break
      case 'child_database':
        out.push({ kind: 'skip', source: 'base', label: typeof d.title === 'string' && d.title ? d.title : 'base de données', reason: 'base de données : non lue' })
        break
      case 'bookmark':
      case 'embed':
      case 'link_preview':
        if (typeof d.url === 'string') out.push(linkRef(d.url, plain(d.caption)))
        break
    }
    if (b.children?.length) blockRefs(b.children, out)
  }
  return out
}
