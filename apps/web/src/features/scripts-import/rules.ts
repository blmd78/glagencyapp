/**
 * Règles de l'écran d'import — pures, testées sans mock (même patron que `snap-codes/access.ts`).
 * La RLS de `script_imports` (0184) reste le vrai verrou ; ces règles décident de l'affichage et
 * du refus métier avant toute écriture.
 */
export interface ImportRow {
  id: string
  createdBy: string
  status: 'prepared' | 'sending' | 'sent' | 'failed'
  errorsCount: number
  createdAt: string
  /** En `sending` : heure de DÉPART de l'envoi ; en `sent` : heure de fin. */
  sentAt: string | null
  mypulsScriptId: number | null
}

export function canSend(row: ImportRow, viewerId: string): { ok: true } | { ok: false; reason: string } {
  if (row.createdBy !== viewerId) return { ok: false, reason: 'Cet import ne t’appartient pas.' }
  if (row.status !== 'prepared') return { ok: false, reason: 'Cet import est déjà parti ou en cours d’envoi.' }
  if (row.errorsCount > 0) {
    return { ok: false, reason: 'Le rapport contient des erreurs : corrige le script dans Notion puis prépare-le à nouveau.' }
  }
  return { ok: true }
}


/** Au-delà, un envoi encore « en cours » a été coupé (durée maximale Vercel) : le script reste désactivé. */
const SENDING_STALE_MS = 15 * 60_000

export type ImportStatus = 'prêt' | 'à corriger' | 'envoi en cours' | 'interrompu' | 'envoyé' | 'échec'

export function importStatus(row: ImportRow, now: Date): ImportStatus {
  switch (row.status) {
    case 'prepared':
      return row.errorsCount > 0 ? 'à corriger' : 'prêt'
    case 'sending':
      return row.sentAt && now.getTime() - new Date(row.sentAt).getTime() < SENDING_STALE_MS ? 'envoi en cours' : 'interrompu'
    case 'sent':
      return 'envoyé'
    case 'failed':
      return 'échec'
  }
}
