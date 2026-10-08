import { describe, expect, it } from 'vitest'
import { NotionError } from '@glagency/scripts'
import { checkDraftForSend, failureText, notionReadMessage, withSendLock } from './send-rules'

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

describe('notionReadMessage', () => {
  it('erreurs Notion attendues → message pour le manager ; le reste → null (technique : Sentry + générique)', () => {
    expect(notionReadMessage(new NotionError(404, 'x'))).toBe('Page Notion introuvable, ou pas partagée avec le CRM (Partager → Connexions → GL Agency CRM).')
    expect(notionReadMessage(new NotionError(403, 'x'))).toBe('Page Notion introuvable, ou pas partagée avec le CRM (Partager → Connexions → GL Agency CRM).')
    expect(notionReadMessage(new NotionError(401, 'x'))).toBe('Connexion Notion expirée : un admin doit reconnecter Notion.')
    expect(notionReadMessage(new NotionError(429, 'x'))).toBe('Notion limite le débit : réessaie dans une minute.')
    expect(notionReadMessage(new NotionError(500, 'x'))).toBeNull()
    expect(notionReadMessage(new Error('ingest_session lecture : permission denied'))).toBeNull()
  })
})

describe('withSendLock', () => {
  const lock = (free: boolean) => {
    const calls: string[] = []
    return {
      calls,
      acquire: async (holder: string) => {
        calls.push(`acquire ${holder}`)
        return free
      },
      release: async (holder: string) => {
        calls.push(`release ${holder}`)
      },
    }
  }
  it('un seul envoi à la fois sur la session partagée : verrou pris, travail fait, verrou rendu', async () => {
    const l = lock(true)
    expect(await withSendLock(l, 'i1', async () => 'ok')).toBe('ok')
    expect(l.calls).toEqual(['acquire i1', 'release i1'])
  })
  it('verrou rendu même si le travail échoue', async () => {
    const l = lock(true)
    await expect(withSendLock(l, 'i1', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(l.calls).toEqual(['acquire i1', 'release i1'])
  })
  it('verrou déjà pris (autre envoi en cours) → refus lisible, rien n’est lancé', async () => {
    const l = lock(false)
    let ran = false
    await expect(
      withSendLock(l, 'i2', async () => {
        ran = true
      }),
    ).rejects.toThrow('Un autre script est en cours d’envoi vers MyPuls (un seul à la fois) : réessaie dans une à deux minutes.')
    expect(ran).toBe(false)
    expect(l.calls).toEqual(['acquire i2'])
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
