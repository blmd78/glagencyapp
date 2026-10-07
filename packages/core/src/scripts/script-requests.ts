import type { DraftBranch, DraftMessage, ScriptDraft } from './script-draft'

/**
 * Champs des requêtes du Studio MyPuls, tels que les envoie son propre code
 * (`cdn.mypuls.app/assets/js/pages/script-studio-*.js`, relevé du 2026-10-06) : FormData pour le
 * script et les messages, JSON pour les embranchements.
 */
export function scriptFields(d: ScriptDraft, name: string = d.name): Record<string, string> {
  return { name, description: d.description, ai_brief: '', is_sequence: d.isSequence ? '1' : '0', used_ratio: '' }
}

export function messageFields(m: DraftMessage): {
  title: string
  content: string
  price: string
  medias_json: string
  chain_delays_json: string
} {
  const pending = m.pendingMedia
    ? ` · 🖼️ À RATTACHER : ${m.pendingMedia.description}${m.pendingMedia.price > 0 ? ` · 🔒 ${m.pendingMedia.price} €` : ''}`
    : ''
  return {
    title: m.title + pending,
    content: m.content,
    price: String(m.price),
    // Le Studio envoie les ids MYM en nombres et les vocaux (UUID) en chaînes.
    medias_json: JSON.stringify(m.media.map((id) => (/^\d+$/.test(id) ? Number(id) : id))),
    chain_delays_json: JSON.stringify(m.chainDelays),
  }
}

export function branchBody(b: DraftBranch): { label: string; paths: Array<{ label: string; color: string }> } {
  return { label: b.label, paths: b.paths.map((p) => ({ label: p.label, color: p.color })) }
}
