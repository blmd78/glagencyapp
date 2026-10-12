import { fold, mediaLabel } from './media-match'
import { SCRIPT_LIMITS, type DraftMessage, type ScriptDraft } from './script-draft'

/**
 * Suffixe de titre d'un vocal pas encore enregistré, envoyé à l'écrit — mot pour mot la règle du
 * prompt de vente V3 (OUTILS MANAGERS) : « si le vocal n'est pas encore enregistré, ajoute au titre
 * « (pas encore fait donc à l'écrit en attendant) » et passe le message en 💬 Texte ».
 */
export const WRITTEN_VOICE_SUFFIX = ' (pas encore fait donc à l’écrit en attendant)'

const VOICE_LABEL = /^vocal\s*\d+$/

/**
 * Vocaux restés « à rattacher » faute d'audio dans MyM : le message part À L'ÉCRIT, avec le texte que le
 * vocal devait dire (`voiceNotes`), au lieu d'un « . » vide — le script est utilisable tout de suite.
 * Seulement un vocal gratuit dont la bulle est le « . » de la convention, au libellé SANS AMBIGUÏTÉ (un
 * seul texte, une seule description dans le script — même garde que `attachFromLibrary`), et dont aucun
 * média de la collection ne porte le titre (`inLibrary`, titres déjà repliés : l'audio existe, ce n'est
 * pas « pas encore fait »). Libellés comparés comme pour les médias (`fold`, `mediaLabel`).
 */
export function writeMissingVoices(draft: ScriptDraft, inLibrary: ReadonlySet<string> = new Set()): { draft: ScriptDraft; written: number } {
  const texts = new Map<string, Set<string>>()
  for (const v of draft.voiceNotes ?? []) {
    const label = fold(mediaLabel(v.label))
    if (v.text.trim()) texts.set(label, (texts.get(label) ?? new Set()).add(v.text.trim()))
  }
  if (!texts.size) return { draft, written: 0 }
  const all = draft.items.flatMap((it) => (it.type === 'message' ? [it] : it.paths.flatMap((p) => p.messages)))
  const usages = new Map<string, Set<string>>()
  for (const m of all) {
    if (!m.pendingMedia || m.media.length) continue
    const label = fold(mediaLabel(m.pendingMedia.description))
    usages.set(label, (usages.get(label) ?? new Set()).add(fold(m.pendingMedia.description)))
  }
  let written = 0
  const write = (m: DraftMessage): DraftMessage => {
    if (!m.pendingMedia || m.media.length || m.pendingMedia.price !== 0 || m.content.trim() !== '.') return m
    const label = fold(mediaLabel(m.pendingMedia.description))
    const known = texts.get(label)
    if (!VOICE_LABEL.test(label) || inLibrary.has(label) || known?.size !== 1 || usages.get(label)?.size !== 1) return m
    written++
    const room = SCRIPT_LIMITS.titleMax - WRITTEN_VOICE_SUFFIX.length
    return { ...m, title: m.title.slice(0, room) + WRITTEN_VOICE_SUFFIX, content: [...known][0]!, pendingMedia: null }
  }
  const items = draft.items.map((it) =>
    it.type === 'message' ? write(it) : { ...it, paths: it.paths.map((p) => ({ ...p, messages: p.messages.map(write) })) },
  )
  return written ? { draft: { ...draft, items }, written } : { draft, written: 0 }
}
