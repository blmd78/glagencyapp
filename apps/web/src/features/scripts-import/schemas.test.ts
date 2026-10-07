import { describe, expect, it } from 'vitest'
import { prepareImportSchema } from './schemas'

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
