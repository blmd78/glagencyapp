import { describe, expect, it } from 'vitest'
import { canSend, importStatus, type ImportRow } from './rules'

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  id: 'i1',
  createdBy: 'u1',
  status: 'prepared',
  errorsCount: 0,
  createdAt: '2026-10-07T10:00:00Z',
  sentAt: null,
  mypulsScriptId: null,
  ...over,
})

describe('canSend', () => {
  it('seulement une ligne prête, sans erreur, de l’appelant', () => {
    expect(canSend(row(), 'u1')).toEqual({ ok: true })
    expect(canSend(row({ createdBy: 'u2' }), 'u1')).toEqual({ ok: false, reason: 'Cet import ne t’appartient pas.' })
    expect(canSend(row({ errorsCount: 2 }), 'u1')).toEqual({
      ok: false,
      reason: 'Le rapport contient des erreurs : corrige le script dans Notion puis prépare-le à nouveau.',
    })
    expect(canSend(row({ status: 'sending' }), 'u1')).toEqual({ ok: false, reason: 'Cet import est déjà parti ou en cours d’envoi.' })
    expect(canSend(row({ status: 'sent' }), 'u1')).toEqual({ ok: false, reason: 'Cet import est déjà parti ou en cours d’envoi.' })
    expect(canSend(row({ status: 'failed' }), 'u1')).toEqual({ ok: false, reason: 'Cet import est déjà parti ou en cours d’envoi.' })
  })
})

describe('importStatus', () => {
  const now = new Date('2026-10-07T10:30:00Z')
  it('libellés, et « interrompu » pour un envoi resté en cours plus de 15 min', () => {
    expect(importStatus(row(), now)).toBe('prêt')
    expect(importStatus(row({ errorsCount: 1 }), now)).toBe('à corriger')
    // En `sending`, `sentAt` = heure de DÉPART de l'envoi (posée par le verrou) ; mise à jour à la fin.
    expect(importStatus(row({ status: 'sending', sentAt: '2026-10-07T10:25:00Z' }), now)).toBe('envoi en cours')
    expect(importStatus(row({ status: 'sending', sentAt: '2026-10-07T10:00:00Z' }), now)).toBe('interrompu')
    expect(importStatus(row({ status: 'sending', sentAt: null }), now)).toBe('interrompu')
    expect(importStatus(row({ status: 'sent', sentAt: '2026-10-07T10:02:00Z' }), now)).toBe('envoyé')
    expect(importStatus(row({ status: 'failed' }), now)).toBe('échec')
  })
})
