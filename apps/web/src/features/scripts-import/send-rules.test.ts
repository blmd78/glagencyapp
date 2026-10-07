import { describe, expect, it } from 'vitest'
import { checkDraftForSend, failureText } from './send-rules'

describe('checkDraftForSend', () => {
  const msg = { type: 'message', title: '#1', content: 'coucou', price: 0, media: [], pendingMedia: null, chainDelays: [] }
  const draft = (items: unknown[]) => ({ name: 'Script', description: '', isSequence: true, items })
  it('revérifie le brouillon RELU en base : conforme → le brouillon', () => {
    const r = checkDraftForSend(draft([msg]))
    expect(r.ok).toBe(true)
  })
  it('brouillon invalide (réécrit hors de l’écran) → refus, rien ne part', () => {
    expect(checkDraftForSend(draft([{ ...msg, price: 3, media: ['1'] }]))).toEqual({
      ok: false,
      reason: 'Le brouillon ne passe plus la vérification (1 erreur) : prépare le script à nouveau.',
    })
    expect(checkDraftForSend({ name: 'x' })).toEqual({ ok: false, reason: 'Brouillon illisible : prépare le script à nouveau.' })
  })
})

describe('failureText', () => {
  const base = { scriptName: 'Soirée', failedStep: 'message « #4 »', error: 'POST … 500' }
  it('échec : le message fidèle au nettoyage RÉELLEMENT obtenu, relu depuis la ligne (survit au rechargement)', () => {
    expect(failureText({ ...base, status: 'échec', mypulsScriptId: 42, cleanup: { deactivated: false, renamed: true } })).toBe(
      'ÉCHEC à l’étape « message « #4 » » : POST … 500\nscript 42 TOUJOURS ACTIF et renommé « ⚠️ INCOMPLET — Soirée » : le désactiver tout de suite dans le Studio, puis le supprimer.',
    )
    expect(failureText({ ...base, status: 'échec', mypulsScriptId: null, cleanup: null })).toBe(
      'ÉCHEC à l’étape « message « #4 » » : POST … 500\naucun script créé.',
    )
  })
  it('interrompu : dit quel script vérifier ; sinon rien', () => {
    expect(failureText({ ...base, status: 'interrompu', mypulsScriptId: 7, cleanup: null, error: null, failedStep: null })).toBe(
      'Envoi interrompu avant la fin (durée maximale atteinte ou connexion coupée). Script 7 créé dans MyPuls : vérifie qu’il est désactivé, puis supprime-le.',
    )
    expect(failureText({ ...base, status: 'interrompu', mypulsScriptId: null, cleanup: null, error: null, failedStep: null })).toBe(
      'Envoi interrompu avant la fin (durée maximale atteinte ou connexion coupée). Aucun script enregistré : vérifie dans le Studio.',
    )
    expect(failureText({ ...base, status: 'envoyé', mypulsScriptId: 7, cleanup: null })).toBeNull()
  })
})
