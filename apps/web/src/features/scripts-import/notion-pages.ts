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

/** Mots qui ne désignent pas une modèle : « Scripts Emma » est le dossier d'Emma, « Scripts » un dossier générique. */
const GENERIC = new Set(['script', 'scripts', 'dossier', 'dossiers'])
/** Garde-fou de la remontée à travers les dossiers génériques. */
const MAX_DEPTH = 8

type Word = { word: string; capital: boolean }
/** Mots d'un titre — casse, accents, emojis et ponctuation ignorés ; `capital` = initiale majuscule. */
const wordsOf = (s: string): Word[] =>
  s
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => ({ word: w.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(), capital: /^\p{Lu}/u.test(w) }))
const joined = (ws: string[]) => ws.join(' ')
const containsRun = (hay: string[], run: string[]) => hay.some((_, i) => run.every((w, k) => hay[i + k] === w))

/**
 * Range les pages partagées avec la connexion, sans page racine ni structure imposée. Une page est un
 * script de la modèle M si :
 *   1. son TITRE nomme M — en mots entiers à initiale majuscule, n'importe où (« Script Lucie KYC »,
 *      « Relance (EMMA) » ; « relance claire » en minuscules est un mot courant), ou en fin de titre
 *      après « · » quelle que soit la casse (convention d'OUTILS MANAGERS) ; le nom le plus précis
 *      l'emporte (« Julie (privé) » sur Julie) ;
 *   2. ou elle est rangée dans le DOSSIER de M (« EMMA », « Scripts Emma »), directement ou à travers
 *      des dossiers génériques (« EMMA › Scripts › KYC ») — pas à travers un dossier nommé (« Ventes »).
 * Jamais un script : un dossier de modèle ou générique lui-même, une sous-page d'un script (page média),
 * une page qui nomme deux modèles ou dont le titre contredit le dossier. Le reste (prompts, dossiers,
 * pages média) va dans « autres », groupé par dossier parent, choisissable à la main.
 * `creators` = les modèles de l'appelant : une modèle hors périmètre n'est jamais présélectionnée ; deux
 * modèles du même nom → pas de présélection.
 */
export function organizeNotionPages(
  pages: SharedPage[],
  creators: Array<{ id: string; name: string }>,
): { recognized: ScriptFolder[]; others: ScriptFolder[] } {
  type Creator = (typeof creators)[number]
  const byId = new Map(pages.map((p) => [p.id, p]))
  const named = creators.map((c) => ({ c, words: wordsOf(c.name).map((w) => w.word) })).filter((n) => n.words.length > 0)

  const isGeneric = (title: string) => {
    const ws = wordsOf(title)
    return ws.length > 0 && ws.every((w) => GENERIC.has(w.word))
  }
  /** Dossier de modèle : son titre, mots génériques ôtés, est exactement le nom d'UNE modèle. */
  const folderOf = (title: string): Creator | null => {
    const rest = joined(wordsOf(title).map((w) => w.word).filter((w) => !GENERIC.has(w)))
    const hits = named.filter((n) => joined(n.words) === rest)
    return hits.length === 1 ? hits[0]!.c : null
  }
  const folderAbove = (p: SharedPage): Creator | null => {
    let id = p.parentId
    for (let depth = 0; id && depth < MAX_DEPTH; depth++) {
      const parent = byId.get(id)
      if (!parent) return null
      const c = folderOf(parent.title)
      if (c || !isGeneric(parent.title)) return c
      id = parent.parentId
    }
    return null
  }
  const namedIn = (title: string): Creator[] => {
    const ws = wordsOf(title)
    const suffix = title.includes(' · ') ? joined(wordsOf(title.split(' · ').pop() ?? '').map((w) => w.word)) : null
    const hits = named.filter(
      (n) => joined(n.words) === suffix || ws.some((w, i) => w.capital && n.words.every((x, k) => ws[i + k]?.word === x)),
    )
    const precise = hits.filter((h) => !hits.some((o) => o.words.length > h.words.length && containsRun(o.words, h.words)))
    return [...new Set(precise.map((h) => h.c))]
  }
  const memo = new Map<string, Creator | null>()
  const scriptOf = (p: SharedPage): Creator | null => {
    const known = memo.get(p.id)
    if (known !== undefined) return known
    memo.set(p.id, null) // garde-fou : un cycle de parents ne boucle pas
    let creator: Creator | null = null
    const parent = p.parentId ? byId.get(p.parentId) : undefined
    if (!folderOf(p.title) && !isGeneric(p.title) && !(parent && scriptOf(parent))) {
      const inTitle = namedIn(p.title)
      const folder = folderAbove(p)
      const title = inTitle.length === 1 ? inTitle[0]! : null
      if (inTitle.length <= 1 && !(title && folder && title.id !== folder.id)) creator = title ?? folder
    }
    memo.set(p.id, creator)
    return creator
  }

  const recognized = new Map<string, ScriptFolder>()
  const others = new Map<string, ScriptFolder>()
  for (const p of pages) {
    const script = { id: p.id, title: p.title || 'Sans titre' }
    const parentTitle = p.parentId ? byId.get(p.parentId)?.title : undefined
    const creator = scriptOf(p)
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
