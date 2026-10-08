import { attachFromLibrary, sameCollectionName, validateScriptDraft, type LibraryMedia, type ScriptDraft } from '@glagency/core'
import type { MediaReport, StudioWriter } from './send'

/** Au-delà, la collection n'est pas lue (une lecture de fiche par média, sous le verrou d'envoi). */
export const MAX_LIBRARY_MEDIA = 60

/** Messages encore « à rattacher » (média nommé dans le script, sans média MyPuls). */
export function pendingCount(draft: ScriptDraft): number {
  const all = draft.items.flatMap((it) => (it.type === 'message' ? [it] : it.paths.flatMap((p) => p.messages)))
  return all.filter((m) => m.pendingMedia && !m.media.length).length
}

/**
 * Rattache les médias depuis la collection du même nom que le script — cherchée au titre Notion
 * (`scriptTitle`), à défaut au nom du brouillon (produit par la conversion) — titre MyM = libellé du
 * script (`attachFromLibrary`). Au mieux, et vite : une collection absente ou en double, une
 * bibliothèque illisible (au premier refus, 429 compris : pas d'attente sous le verrou), une collection
 * de plus de `MAX_LIBRARY_MEDIA` médias ou un brouillon qui ne passerait plus la vérification laissent
 * tout « à rattacher », et l'envoi continue — le script part désactivé et se relit dans le Studio.
 */
export async function withLibrary(
  writer: StudioWriter,
  draft: ScriptDraft,
  scriptTitle?: string,
): Promise<{ draft: ScriptDraft; media: MediaReport }> {
  const pending = pendingCount(draft)
  const keep = (reason: MediaReport['reason'], collection: string | null = null) => ({
    draft,
    media: { attached: 0, pending, collection, reason },
  })
  if (!pending) return keep(null)
  try {
    const collections = await writer.listCollections()
    const named = (name: string) => collections.filter((c) => sameCollectionName(name, c.name))
    let matches = scriptTitle ? named(scriptTitle) : []
    if (!matches.length) matches = named(draft.name)
    if (matches.length > 1) return keep('ambiguë')
    const collection = matches[0]
    if (!collection) return keep('absente')
    const items = await writer.listCollectionMedia(collection.id)
    if (items.length > MAX_LIBRARY_MEDIA) return keep('trop de médias', collection.name)
    const library: LibraryMedia[] = []
    for (const m of items) library.push({ ...m, title: await writer.mediaTitle(m.id) })
    const r = attachFromLibrary(draft, library)
    if (validateScriptDraft(r.draft).length) return keep('invalide', collection.name)
    return { draft: r.draft, media: { attached: r.attached, pending: r.pending, collection: collection.name, reason: null } }
  } catch (e) {
    console.warn('[script] bibliothèque de médias illisible — médias laissés à rattacher :', e instanceof Error ? e.message : e)
    return keep('illisible')
  }
}
