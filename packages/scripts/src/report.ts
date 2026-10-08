import { INCOMPLETE_PREFIX, type DraftError, type DraftSummary } from '@glagency/core'
import type { MediaReport, SendResult } from './send'

/** Textes du rapport et de l'échec — partagés par la commande `script-mypuls` et l'écran d'import du CRM. */
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

export function formatReport(s: DraftSummary, errors: DraftError[], notes: DraftError[] = []): string {
  const lines = [
    `${plural(s.messages, 'message')} · ${plural(s.branches, 'embranchement')} · ${s.paid} PPV · total ${s.totalPrice} €`,
    s.sequence
      ? 'mode : séquence (le chat déroule le script, les embranchements deviennent des boutons de réponse)'
      : 'mode : banque de messages (choisis à la main, sans ordre imposé)',
  ]
  if (s.pendingMedia > 0) {
    lines.push(`${plural(s.pendingMedia, 'message')} à média : rattachés à l'envoi si les médias portent ce libellé dans MyM (collection du même nom que le script), sinon « 🖼️ À RATTACHER » dans le Studio`)
  }
  if (notes.length > 0) {
    lines.push(`${plural(notes.length, 'ajustement')} :`)
    for (const n of notes) lines.push(`  • ${n.where} : ${n.message}`)
  }
  if (errors.length === 0) lines.push('0 erreur — prêt à envoyer')
  else {
    lines.push(`${plural(errors.length, 'erreur')} — rien ne sera envoyé :`)
    for (const e of errors) lines.push(`  • ${e.where} : ${e.message}`)
  }
  return lines.join('\n')
}

/** Message d'échec fidèle à ce que le nettoyage a VRAIMENT obtenu (relu, pas supposé). */
export function describeFailure(r: Extract<SendResult, { ok: false }>, name: string): string {
  const head = `ÉCHEC à l’étape « ${r.step} » : ${r.error}`
  if (r.scriptId === null || !r.cleanup) return `${head}\naucun script créé.`
  const { deactivated, renamed } = r.cleanup
  const nameNote = renamed ? `renommé « ${INCOMPLETE_PREFIX}${name} »` : `renommage IMPOSSIBLE — il garde le nom « ${name} »`
  if (deactivated === true) return `${head}\nscript ${r.scriptId} désactivé et ${nameNote} : à supprimer dans le Studio.`
  if (deactivated === false) {
    return `${head}\nscript ${r.scriptId} TOUJOURS ACTIF et ${nameNote} : le désactiver tout de suite dans le Studio, puis le supprimer.`
  }
  return `${head}\nscript ${r.scriptId} : état actif/désactivé ILLISIBLE et ${nameNote} : à vérifier et supprimer dans le Studio.`
}

/**
 * Bilan des médias après un envoi réussi, en MESSAGES à média (un PPV de 3 photos = 1 message) :
 * complétés depuis la collection du script (titre MyM = libellé), restés à rattacher — et pourquoi.
 */
export function describeMedia(m: MediaReport): string {
  const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`
  const parts: string[] = []
  if (m.attached) {
    parts.push(`${n(m.attached, 'message à média complété', 'messages à média complétés')} depuis la collection « ${m.collection} »`)
  }
  if (m.pending) {
    const rest = m.attached ? `${m.pending} à rattacher dans le Studio` : `${n(m.pending, 'message', 'messages')} à média à rattacher dans le Studio`
    const why: Record<NonNullable<MediaReport['reason']>, string> = {
      absente: 'aucune collection au nom du script',
      ambiguë: 'plusieurs collections au nom du script',
      illisible: 'bibliothèque MyPuls illisible',
      'trop de médias': `collection « ${m.collection} » trop grosse pour être lue`,
      invalide: 'rattachement refusé par la vérification',
    }
    const cause = m.reason ? why[m.reason] : m.attached ? null : `aucun média titré comme le script dans « ${m.collection} »`
    parts.push(cause ? `${rest} (${cause})` : rest)
  }
  return parts.join(', ')
}