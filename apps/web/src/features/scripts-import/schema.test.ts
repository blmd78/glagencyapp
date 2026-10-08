import { describe, expect, it } from 'vitest'
import { prepareImportInput, prepareImportSchema, prepareStatusInput } from './schema'

const creatorId = '00000000-0000-4000-8000-000000000001'

describe('prepareImportSchema', () => {
  it('lien Notion collé (script rangé dans un sous-dossier) → id de page normalisé', () => {
    const r = prepareImportSchema.safeParse({
      notionPageId: ' https://www.notion.so/agence/Script-de-vente-Soiree-0123456789abcdef0123456789ABCDEF?pvs=4 ',
      creatorId,
    })
    expect(r.success && r.data.notionPageId).toBe('01234567-89ab-cdef-0123-456789abcdef')
  })
  it('id de la liste → accepté tel quel (normalisé)', () => {
    const r = prepareImportSchema.safeParse({ notionPageId: '01234567-89ab-cdef-0123-456789abcdef', creatorId })
    expect(r.success && r.data.notionPageId).toBe('01234567-89ab-cdef-0123-456789abcdef')
  })
  it('saisie sans id de page (ou chemin forgé) → refus lisible, rien n’est appelé chez Notion', () => {
    const r = prepareImportSchema.safeParse({ notionPageId: '../../users/me', creatorId })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('Lien Notion invalide : colle le lien de la page du script.')
  })
})

describe('prepareImportInput (contrat de l’action)', () => {
  const ok = { notionPageId: '01234567-89ab-cdef-0123-456789abcdef', creatorId }
  it('exige la clé anti-doublon générée au clic', () => {
    expect(prepareImportInput.safeParse(ok).success).toBe(false)
    const r = prepareImportInput.safeParse({ ...ok, requestId: '00000000-0000-4000-8000-0000000000aa' })
    expect(r.success && r.data.requestId).toBe('00000000-0000-4000-8000-0000000000aa')
  })
  it('le formulaire, lui, ne porte pas la clé (variante saisie)', () => {
    expect(prepareImportSchema.safeParse(ok).success).toBe(true)
  })
})

describe('prepareStatusInput (relecture d’une préparation dont la réponse a été coupée)', () => {
  it('la clé du clic, et rien d’autre', () => {
    expect(prepareStatusInput.safeParse({ requestId: creatorId }).success).toBe(true)
    expect(prepareStatusInput.safeParse({ requestId: 'pas-une-cle' }).success).toBe(false)
    expect(prepareStatusInput.safeParse({}).success).toBe(false)
  })
})
