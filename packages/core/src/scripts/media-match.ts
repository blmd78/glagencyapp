import { SCRIPT_LIMITS, type DraftMessage, type ScriptDraft } from './script-draft'

/**
 * Rattachement automatique des médias d'un script, par TITRE (décision Benoit, 2026-10-08).
 *
 * Mesuré sur MyPuls : les médias d'un script vivent dans la collection du même nom (« Script-Chambre
 * 2 🤍 (1) » → collection « Script-Chambre 2 🤍 »), mais rien n'y dit quel média va dans quel message
 * (l'ordre de la collection ne suit pas le script) et les titres sont vides. Convention : chaque média
 * porte, dans MyM, le libellé du script (« PHOTO 2 », « PPV 1 », « VOCAL 1 » — tous les médias d'un pack,
 * le même). On rattache sur titre IDENTIQUE (casse, accents et espaces ignorés), jamais au plus proche,
 * et seulement quand le libellé est sans ambiguïté. Le reste demeure « à rattacher ».
 */

/** Casse, accents, caractères invisibles (U+200B…, sélecteurs d'emoji U+FE0E/F) et espaces multiples ignorés. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[​-‍﻿︎️]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * Le libellé d'un média dans le script = ce qui précède le premier tiret long (– ou —), à défaut le
 * premier tiret court (« PPV 1 – 3 photos » → « PPV 1 », « PPV 1 - BIS – … » → « PPV 1 - BIS »), sans
 * le pictogramme de tête (« 🖼️ PHOTO 2 »).
 */
export function mediaLabel(description: string): string {
  const text = description.replace(/^[^\p{L}\p{N}]+/u, '')
  const parts = /\s[–—]\s/.test(text) ? text.split(/\s[–—]\s/) : text.split(/\s-\s/)
  return parts[0]!.trim()
}

/** La collection d'un script porte son nom, à la numérotation « (1) » près. */
export function sameCollectionName(scriptName: string, collectionName: string): boolean {
  const bare = (s: string) => fold(s).replace(/\s*\(\d+\)$/, '')
  return bare(scriptName) === bare(collectionName)
}

export interface LibraryMedia {
  id: string
  type: string
  title: string
}

const KNOWN_TYPES = new Set(['photo', 'video', 'audio'])

/**
 * Rattache à chaque message « à rattacher » les médias de `library` (la collection du script) dont le
 * titre est son libellé, pose le prix prévu et garde la description dans le titre (« · 🖼️ PPV 1 – 3
 * photos ») pour la relecture dans le Studio. Laisse « à rattacher » quand :
 *   - le libellé n'a pas de numéro (« PHOTO ») ou désigne deux médias DIFFÉRENTS du script ;
 *   - aucun média ne porte ce titre, ou plus que le Studio n'en accepte ;
 *   - un type est inconnu, un vocal se mêle à une photo / vidéo, ou plus d'un vocal, ou un vocal payant.
 * Les messages déjà munis de médias ne sont pas touchés.
 */
export function attachFromLibrary(draft: ScriptDraft, library: LibraryMedia[]): { draft: ScriptDraft; attached: number; pending: number } {
  const byTitle = new Map<string, LibraryMedia[]>()
  for (const m of library) {
    const key = fold(m.title)
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), m])
  }
  const all = draft.items.flatMap((it) => (it.type === 'message' ? [it] : it.paths.flatMap((p) => p.messages)))
  // Libellé → descriptions distinctes du script : un libellé qui en couvre deux est ambigu.
  const usages = new Map<string, Set<string>>()
  for (const m of all) {
    if (!m.pendingMedia || m.media.length) continue
    const label = fold(mediaLabel(m.pendingMedia.description))
    usages.set(label, (usages.get(label) ?? new Set()).add(fold(m.pendingMedia.description)))
  }
  let attached = 0
  let pending = 0
  const resolve = (m: DraftMessage): DraftMessage => {
    if (!m.pendingMedia || m.media.length) return m
    const label = fold(mediaLabel(m.pendingMedia.description))
    const hits = byTitle.get(label) ?? []
    const audio = hits.filter((h) => h.type === 'audio').length
    const ok =
      /\d/.test(label) &&
      (usages.get(label)?.size ?? 0) === 1 &&
      hits.length > 0 &&
      hits.length <= SCRIPT_LIMITS.maxMedias &&
      hits.every((h) => KNOWN_TYPES.has(h.type)) &&
      (audio === 0 || (audio === 1 && hits.length === 1 && m.pendingMedia.price === 0))
    if (!ok) {
      pending++
      return m
    }
    attached++
    const title = `${m.title} · 🖼️ ${m.pendingMedia.description}`.slice(0, SCRIPT_LIMITS.titleMax)
    return { ...m, title, media: hits.map((h) => h.id), price: m.pendingMedia.price, pendingMedia: null }
  }
  const items = draft.items.map((it) =>
    it.type === 'message' ? resolve(it) : { ...it, paths: it.paths.map((p) => ({ ...p, messages: p.messages.map(resolve) })) },
  )
  return { draft: { ...draft, items }, attached, pending }
}
