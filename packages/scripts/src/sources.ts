import { NotionError, blocksToText, isPromptTitle, readNotionPage } from './notion'
import { GDOC, GDRIVE, NOTION_FILE_HOST, blockRefs, hostOf, type Ref, type SourceKind } from './source-refs'

export type { SourceKind }

/**
 * Tout ce qu'une page de script contient, rassemblé pour la conversion (spec 2026-10-12) : un script
 * arrive pareil dans MyPuls qu'il soit écrit dans la page, dans un PDF joint, dans une page liée ou
 * dans un Google Doc public. UN niveau seulement : la page, puis ce qu'elle cite — pas ce que citent
 * les pages citées (sauf leurs PDF). Chaque source est rapportée, lue ou non, avec la raison.
 *
 * Aucune adresse quelconque n'est appelée : les fichiers viennent de l'hébergement Notion (adresse
 * signée renvoyée par l'API), et les adresses Google sont RECONSTRUITES depuis l'id du document.
 */
export interface ScriptSource {
  kind: SourceKind
  label: string
  status: 'lu' | 'non lu'
  reason: string | null
}
/** PDF à joindre tel quel à la conversion (Claude lit le PDF, mise en page comprise). */
export interface PdfDocument {
  name: string
  /** Contenu en base64. */
  data: string
}
export interface GatheredScript {
  title: string
  /** Texte de la page, puis de chaque page liée et Google Doc lus, chacun sous « === … === ». */
  text: string
  pdfs: PdfDocument[]
  sources: ScriptSource[]
}

/** Plafonds : la requête à Claude reste sous ses 32 Mo (base64 = +33 %), la lecture sous la minute. */
export const SOURCE_LIMITS = {
  pages: 10,
  pdfs: 5,
  pdfBytes: 20 * 1024 * 1024,
  totalPdfBytes: 20 * 1024 * 1024,
  textChars: 150_000,
  /** Par téléchargement (PDF, Google), requête ET lecture du corps : un flux bloqué ne fige pas « Préparer ». */
  downloadMs: 60_000,
} as const

const NOT_SHARED = 'page introuvable, ou non partagée avec le CRM (Partager → Connexions → GL Agency CRM)'
const PRIVATE_GOOGLE = 'privé ou illisible : le partager à « tous ceux qui ont le lien », ou coller le texte dans la page'
const PROMPT_REASON = 'prompt : des consignes de rédaction, pas un script'
type Fetch = typeof fetch

/**
 * Corps borné à `max` octets (une adresse ne fait pas télécharger 1 Go) : au-delà, `'trop lourd'` — ou,
 * avec `partial`, les `max` premiers octets et `cut`. Une coupure du flux rend `'coupé'`, jamais une
 * exception : un fichier illisible n'arrête pas la préparation.
 */
async function readBounded(res: Response, max: number, partial = false): Promise<{ bytes: Uint8Array; cut: boolean } | 'trop lourd' | 'coupé'> {
  const declared = Number(res.headers.get('content-length'))
  if (!partial && Number.isFinite(declared) && declared > max) return 'trop lourd'
  const reader = res.body?.getReader()
  if (!reader) return { bytes: new Uint8Array(0), cut: false }
  const parts: Uint8Array[] = []
  let size = 0
  let cut = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (size + value.byteLength > max) {
        await reader.cancel().catch(() => undefined)
        if (!partial) return 'trop lourd'
        parts.push(value.subarray(0, max - size))
        size = max
        cut = true
        break
      }
      parts.push(value)
      size += value.byteLength
    }
  } catch {
    return 'coupé'
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.byteLength
  }
  return { bytes: out, cut }
}
const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 // « %PDF »
const base64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

export async function gatherScript(token: string, pageId: string, fetchFn: Fetch = fetch): Promise<GatheredScript> {
  const main = await readNotionPage(token, pageId, fetchFn)
  const sources: ScriptSource[] = [{ kind: 'page', label: main.title || 'Sans titre', status: 'lu', reason: null }]
  const skip = (kind: SourceKind, label: string, reason: string) => sources.push({ kind, label, status: 'non lu', reason })
  const sections: string[] = [blocksToText(main.blocks)]
  const pdfs: PdfDocument[] = []
  let pdfBytes = 0
  const seen = new Set<string>([pageId.replace(/-/g, '')])

  const takePdf = async (url: string, name: string, kind: 'pdf' | 'google drive' = 'pdf') => {
    if (seen.has(url)) return
    seen.add(url)
    if (pdfs.length >= SOURCE_LIMITS.pdfs) return skip(kind, name, `plafond de ${SOURCE_LIMITS.pdfs} PDF atteint`)
    const room = Math.min(SOURCE_LIMITS.pdfBytes, SOURCE_LIMITS.totalPdfBytes - pdfBytes)
    let res: Response
    try {
      // L'échéance couvre aussi la lecture : le flux s'interrompt, `readBounded` rend « coupé ».
      res = await fetchFn(url, { redirect: 'follow', signal: AbortSignal.timeout(SOURCE_LIMITS.downloadMs) })
    } catch {
      return skip(kind, name, 'téléchargement impossible ou trop long')
    }
    if (!res.ok) return skip(kind, name, kind === 'pdf' ? `téléchargement refusé (${res.status})` : PRIVATE_GOOGLE)
    const body = await readBounded(res, room)
    if (body === 'coupé') return skip(kind, name, 'téléchargement interrompu ou trop long')
    if (body === 'trop lourd') return skip(kind, name, `trop lourd (plus de ${Math.round(room / 1024 / 1024)} Mo disponibles)`)
    const bytes = body.bytes
    if (!isPdf(bytes)) return skip(kind, name, kind === 'pdf' ? 'ce n’est pas un PDF' : PRIVATE_GOOGLE)
    pdfBytes += bytes.byteLength
    pdfs.push({ name, data: base64(bytes) })
    sources.push({ kind, label: name, status: 'lu', reason: null })
  }

  const textSoFar = () => sections.reduce((n, x) => n + x.length + 2, 0)
  const takeUrl = async (url: string, label: string) => {
    const doc = GDOC.exec(url)?.[1]
    const drive = GDRIVE.exec(url)
    if (doc) {
      // Dédoublonné sur l'adresse d'export : « /edit », « ?usp=sharing » et « /export » sont le même Doc.
      const exportUrl = `https://docs.google.com/document/d/${doc}/export?format=txt`
      if (seen.has(exportUrl)) return
      seen.add(exportUrl)
      const room = SOURCE_LIMITS.textChars - textSoFar()
      if (room <= 0) return skip('google doc', label, `plafond de ${SOURCE_LIMITS.textChars} caractères atteint`)
      let res: Response
      try {
        res = await fetchFn(exportUrl, { redirect: 'follow', signal: AbortSignal.timeout(SOURCE_LIMITS.downloadMs) })
      } catch {
        return skip('google doc', label, 'téléchargement impossible ou trop long')
      }
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('text/plain')) return skip('google doc', label, PRIVATE_GOOGLE)
      // Lu dans la place qui reste (4 octets au plus par caractère en UTF-8), jamais au-delà.
      const body = await readBounded(res, room * 4, true)
      if (body === 'coupé' || body === 'trop lourd') return skip('google doc', label, 'téléchargement interrompu ou trop long')
      const full = new TextDecoder().decode(body.bytes).trim()
      // Coupé en octets (flux) OU en caractères (place qui reste) : la lecture est partielle, et dite.
      const cut = body.cut || full.length > room
      sections.push(`=== Google Doc « ${label} » ===\n${full.slice(0, room)}`)
      sources.push({ kind: 'google doc', label, status: cut ? 'non lu' : 'lu', reason: cut ? `lu en partie : coupé à ${room} caractères` : null })
      return
    }
    const driveId = drive?.[1] ?? drive?.[2]
    if (driveId) return takePdf(`https://drive.google.com/uc?export=download&id=${driveId}`, label, 'google drive')
    if (seen.has(url)) return
    seen.add(url)
    skip('lien', label, 'site externe : non lu (coller le texte dans la page)')
  }

  // 1. Ce que cite la page : ses PDF d'abord, puis ses pages et ses liens, dans l'ordre de la page.
  const refs = blockRefs(main.blocks)
  const pages: Array<Extract<Ref, { kind: 'page' }>> = []
  for (const r of refs) {
    if (r.kind === 'skip') skip(r.source, r.label, r.reason)
    else if (r.kind === 'pdf') {
      const host = hostOf(r.url)
      if (host && NOTION_FILE_HOST.test(host)) await takePdf(r.url, r.name)
      else skip('pdf', r.name, 'adresse de fichier inattendue')
    } else if (r.kind === 'url') await takeUrl(r.url, r.label)
    else if (!seen.has(r.id.replace(/-/g, ''))) {
      seen.add(r.id.replace(/-/g, ''))
      pages.push(r)
    }
  }

  // 2. Les pages citées, UN niveau : leur texte, et leurs PDF / Google Docs (pas leurs propres pages).
  for (const [i, ref] of pages.entries()) {
    const fallback = ref.title ?? 'page sans titre'
    if (i >= SOURCE_LIMITS.pages) {
      skip(ref.via, fallback, `plafond de ${SOURCE_LIMITS.pages} pages atteint`)
      continue
    }
    if (ref.title && isPromptTitle(ref.title)) {
      skip(ref.via, ref.title, PROMPT_REASON)
      continue
    }
    let page: Awaited<ReturnType<typeof readNotionPage>>
    try {
      page = await readNotionPage(token, ref.id, fetchFn)
    } catch (e) {
      // Clé expirée ou débit limité : vrai pour TOUTE la lecture, on s'arrête. Sinon cette page seule.
      if (e instanceof NotionError && (e.status === 401 || e.status === 429)) throw e
      if (e instanceof NotionError) {
        skip(ref.via, fallback, e.status === 403 || e.status === 404 ? NOT_SHARED : `illisible (Notion ${e.status})`)
        continue
      }
      throw e
    }
    const title = page.title || fallback
    if (page.trashed) {
      skip(ref.via, title, 'page à la corbeille')
      continue
    }
    if (isPromptTitle(title)) {
      skip(ref.via, title, PROMPT_REASON)
      continue
    }
    sections.push(`=== ${ref.via === 'sous-page' ? 'Sous-page' : 'Page liée'} « ${title} » ===\n${blocksToText(page.blocks)}`)
    sources.push({ kind: ref.via, label: title, status: 'lu', reason: null })
    // Ce qu'elle cite : ses PDF et Google Docs sont lus ; le reste est rapporté, regroupé par sorte
    // (une page média porte souvent plusieurs images : une ligne « ×n » plutôt que n lignes).
    const unread = new Map<string, { kind: SourceKind; reason: string; n: number }>()
    const tally = (kind: SourceKind, reason: string) => {
      const key = `${kind}|${reason}`
      const hit = unread.get(key) ?? { kind, reason, n: 0 }
      hit.n++
      unread.set(key, hit)
    }
    for (const r of blockRefs(page.blocks)) {
      if (r.kind === 'pdf') {
        const host = hostOf(r.url)
        if (host && NOTION_FILE_HOST.test(host)) await takePdf(r.url, r.name)
        else tally('pdf', 'adresse de fichier inattendue')
      } else if (r.kind === 'url') {
        if (GDOC.test(r.url) || GDRIVE.test(r.url)) await takeUrl(r.url, r.label)
        else tally('lien', 'site externe : non lu (coller le texte dans la page)')
      } else if (r.kind === 'skip') tally(r.source, r.reason)
      else if (!seen.has(r.id.replace(/-/g, ''))) tally(r.via, 'citée par une page liée : non lue (un seul niveau)')
    }
    for (const u of unread.values()) skip(u.kind, u.n > 1 ? `${title} ×${u.n}` : title, u.reason)
  }

  let text = sections.filter((s) => s.trim()).join('\n\n')
  if (text.length > SOURCE_LIMITS.textChars) {
    text = text.slice(0, SOURCE_LIMITS.textChars)
    skip('page', 'fin du texte', `texte coupé à ${SOURCE_LIMITS.textChars} caractères`)
  }
  return { title: main.title, text, pdfs, sources }
}
