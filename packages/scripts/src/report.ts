import { INCOMPLETE_PREFIX, type DraftError, type DraftSummary } from '@glagency/core'
import type { SendResult } from './send'

/** Textes du rapport et de l'échec — partagés par la commande `script-mypuls` et l'écran d'import du CRM. */
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

export function formatReport(s: DraftSummary, errors: DraftError[], notes: DraftError[] = []): string {
  const lines = [
    `${plural(s.messages, 'message')} · ${plural(s.branches, 'embranchement')} · ${s.paid} PPV · total ${s.totalPrice} €`,
    s.sequence
      ? 'mode : séquence (le chat déroule le script, les embranchements deviennent des boutons de réponse)'
      : 'mode : banque de messages (choisis à la main, sans ordre imposé)',
  ]
  if (s.pendingMedia > 0) lines.push(`${plural(s.pendingMedia, 'média')} à rattacher dans le Studio (titres « 🖼️ À RATTACHER »)`)
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
