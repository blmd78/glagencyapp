import { matchCreatorByName } from '@glagency/core'
import { NotionError, type SharedPage } from '@glagency/scripts/notion'

/**
 * Lien collé : la page peut vivre dans n'importe quel espace connecté. On les essaie TOUS dans l'ordre :
 * un espace en panne (clé expirée, Notion indisponible) n'empêche pas de trouver la page dans un autre.
 * Absente partout → `null` si chaque espace a répondu « introuvable / non partagé » (404, 403) ; sinon la
 * PREMIÈRE autre erreur remonte (un faux « introuvable » masquerait une clé expirée).
 */
export async function firstWorkspaceWithPage<T>(ids: string[], read: (id: string) => Promise<T | null>): Promise<{ id: string; value: T } | null> {
  let failure: unknown = null
  for (const id of ids) {
    try {
      const value = await read(id)
      if (value !== null) return { id, value }
    } catch (e) {
      const notFound = e instanceof NotionError && (e.status === 404 || e.status === 403)
      if (!notFound && failure === null) failure = e
    }
  }
  if (failure !== null) throw failure
  return null
}

/** Un groupe de pages à l'écran : une modèle reconnue, ou un dossier Notion (« autres »). */
export interface ScriptFolder {
  id: string
  title: string
  /** Modèle présélectionnée (dans le périmètre de l'appelant) ; null = choix manuel. */
  creatorId: string | null
  scripts: Array<{ id: string; title: string }>
}

const NO_FOLDER = 'Sans dossier'
const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'fr')

/**
 * Range les pages partagées avec la connexion, sans page racine ni structure imposée :
 *   1. modèle reconnue par le DOSSIER parent DIRECT (« EMMA » = Emma ; le dossier peut être n'importe où) ;
 *   2. sinon par la FIN DU TITRE (« Script découverte (KYC) · Lucie »), la convention d'OUTILS MANAGERS ;
 *   3. le reste (prompts, dossiers, pages média) dans « autres », groupé par dossier parent.
 * `creators` = les modèles de l'appelant : une modèle hors périmètre n'est jamais présélectionnée.
 * Casse et accents ignorés, nom ambigu → pas de présélection (`matchCreatorByName`).
 */
export function organizeNotionPages(
  pages: SharedPage[],
  creators: Array<{ id: string; name: string }>,
): { recognized: ScriptFolder[]; others: ScriptFolder[] } {
  const titles = new Map(pages.map((p) => [p.id, p.title]))
  const found = (name: string | null | undefined) => {
    if (!name) return null
    const m = matchCreatorByName(creators, name)
    return m.kind === 'found' ? m.row : null
  }
  const recognized = new Map<string, ScriptFolder>()
  const others = new Map<string, ScriptFolder>()
  for (const p of pages) {
    const script = { id: p.id, title: p.title || 'Sans titre' }
    const parentTitle = p.parentId ? titles.get(p.parentId) : undefined
    const suffix = p.title.includes(' · ') ? p.title.split(' · ').pop() : null
    const creator = found(parentTitle) ?? found(suffix)
    if (creator) {
      const key = `modele:${creator.id}`
      const g = recognized.get(key) ?? { id: key, title: creator.name, creatorId: creator.id, scripts: [] }
      g.scripts.push(script)
      recognized.set(key, g)
      continue
    }
    const key = `parent:${parentTitle !== undefined ? p.parentId : ''}`
    const g = others.get(key) ?? { id: key, title: parentTitle !== undefined ? parentTitle || 'Sans titre' : NO_FOLDER, creatorId: null, scripts: [] }
    g.scripts.push(script)
    others.set(key, g)
  }
  const sorted = (groups: Iterable<ScriptFolder>) =>
    [...groups].map((g) => ({ ...g, scripts: [...g.scripts].sort(byTitle) })).sort(byTitle)
  const rest = sorted(others.values())
  // « Sans dossier » toujours en dernier.
  return { recognized: sorted(recognized.values()), others: [...rest.filter((g) => g.id !== 'parent:'), ...rest.filter((g) => g.id === 'parent:')] }
}
