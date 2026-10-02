import { describe, expect, it } from 'vitest'
import { AGENCY_ROLES, composeEventTitle, eventInput, nextAutoTitle, eventRow, IMAGE_MAX_BYTES, imageUploadInput, type EventInput } from './schema'

const base: EventInput = {
  title: 'Mise en avant Juliette', mode: 'jour', startDate: '2026-10-14', endDate: '2026-10-14',
  remindOnDay: false, audience: [...AGENCY_ROLES], color: null, imagePath: null, kind: null, creatorId: null,
}

describe('eventInput', () => {
  it('accepte un jour', () => expect(eventInput.safeParse(base).success).toBe(true))

  it('accepte une période dont la fin suit le début', () => {
    expect(eventInput.safeParse({ ...base, mode: 'periode', endDate: '2026-10-16' }).success).toBe(true)
  })

  it('refuse une période qui finit avant de commencer, sur le champ de fin', () => {
    const r = eventInput.safeParse({ ...base, mode: 'periode', endDate: '2026-10-10' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['endDate'])
  })

  it('refuse un nom vide (espaces compris) et une audience vide', () => {
    expect(eventInput.safeParse({ ...base, title: '   ' }).success).toBe(false)
    expect(eventInput.safeParse({ ...base, audience: [] }).success).toBe(false)
  })

  it('refuse un rôle inconnu', () => {
    expect(eventInput.safeParse({ ...base, audience: ['admin'] }).success).toBe(false)
  })
})

describe('couleur et photo', () => {
  it('accepte une couleur de la palette, refuse toute autre valeur', () => {
    expect(eventInput.safeParse({ ...base, color: '#8b5cf6' }).success).toBe(true)
    expect(eventInput.safeParse({ ...base, color: '#000000' }).success).toBe(false)
  })

  it('photo : seulement une clé `<uuid>.<ext>` du bucket, jamais un chemin forgé ni un SVG', () => {
    expect(eventInput.safeParse({ ...base, imagePath: '0b8f3c2e-5d6a-4f1b-9c7d-2e4a6b8c0d1f.webp' }).success).toBe(true)
    expect(eventInput.safeParse({ ...base, imagePath: '../autre-bucket/x.jpg' }).success).toBe(false)
    expect(eventInput.safeParse({ ...base, imagePath: '0b8f3c2e-5d6a-4f1b-9c7d-2e4a6b8c0d1f.svg' }).success).toBe(false)
  })

  it('envoi : 5 Mo maximum, JPEG / PNG / WebP seulement', () => {
    expect(imageUploadInput.safeParse({ contentType: 'image/jpeg', size: IMAGE_MAX_BYTES }).success).toBe(true)
    expect(imageUploadInput.safeParse({ contentType: 'image/png', size: IMAGE_MAX_BYTES + 1 }).success).toBe(false)
    expect(imageUploadInput.safeParse({ contentType: 'image/svg+xml', size: 1000 }).success).toBe(false)
    expect(imageUploadInput.safeParse({ contentType: 'image/gif', size: 1000 }).success).toBe(false)
  })
})

describe('eventRow', () => {
  it('en mode Jour, la fin EST le début, même si une période avait été choisie avant', () => {
    expect(eventRow({ ...base, mode: 'jour', endDate: '2026-10-20' }).end_date).toBe('2026-10-14')
  })
  it('photo non touchée (`undefined`) : la ligne ne porte pas `image_path` ; retirée (`null`) : elle l\'efface', () => {
    expect('image_path' in eventRow({ ...base, imagePath: undefined })).toBe(false)
    expect(eventRow({ ...base, imagePath: null }).image_path).toBeNull()
  })
  it('en mode Période, garde la fin choisie', () => {
    expect(eventRow({ ...base, mode: 'periode', endDate: '2026-10-20' }).end_date).toBe('2026-10-20')
  })
})

describe('type et modèle (2026-10-02)', () => {
  const ALICE = '0b8f3c2e-5d6a-4f1b-9c7d-2e4a6b8c0d1f'

  it('facultatifs : absents, la saisie passe et la ligne enregistrée les met à null', () => {
    const r = eventInput.safeParse({ ...base, kind: undefined, creatorId: undefined })
    expect(r.success).toBe(true)
    expect(eventRow(r.data!)).toMatchObject({ kind: null, creator_id: null })
  })

  it('type : texte libre de 40 caractères au plus ; modèle : un identifiant ou rien', () => {
    expect(eventInput.safeParse({ ...base, kind: 'Hero slider', creatorId: ALICE }).success).toBe(true)
    expect(eventInput.safeParse({ ...base, kind: 'x'.repeat(41) }).success).toBe(false)
    expect(eventInput.safeParse({ ...base, creatorId: 'alice' }).success).toBe(false)
  })

  it('la ligne enregistrée porte le type (vide → null) et la modèle', () => {
    expect(eventRow({ ...base, kind: '  Carousel ', creatorId: ALICE })).toMatchObject({ kind: 'Carousel', creator_id: ALICE })
    expect(eventRow({ ...base, kind: '   ', creatorId: null })).toMatchObject({ kind: null, creator_id: null })
  })
})

describe('composeEventTitle', () => {
  it('« TYPE MODÈLE » en majuscules, espaces normalisés', () => {
    expect(composeEventTitle('carousel', 'Alice')).toBe('CAROUSEL ALICE')
    expect(composeEventTitle('  pop   up ', 'Carla')).toBe('POP UP CARLA')
  })

  it('rien à composer sans type ou sans modèle', () => {
    expect(composeEventTitle('', 'Alice')).toBe('')
    expect(composeEventTitle('carousel', null)).toBe('')
  })
})

describe('nextAutoTitle — le nom suit type et modèle tant qu’il n’a pas été retouché', () => {
  it('nom vide ou encore automatique : il prend la nouvelle composition', () => {
    expect(nextAutoTitle({ title: '', lastAuto: '', auto: 'CAROUSEL ALICE' })).toEqual({ title: 'CAROUSEL ALICE', lastAuto: 'CAROUSEL ALICE' })
    expect(nextAutoTitle({ title: 'CAROUSEL ALICE', lastAuto: 'CAROUSEL ALICE', auto: 'POP UP ALICE' })).toEqual({
      title: 'POP UP ALICE',
      lastAuto: 'POP UP ALICE',
    })
  })
  it('type vidé ou modèle retirée : un nom automatique se vide aussi, jamais « C ALICE » qui traîne', () => {
    expect(nextAutoTitle({ title: 'CAROUSEL ALICE', lastAuto: 'CAROUSEL ALICE', auto: '' })).toEqual({ title: '', lastAuto: '' })
  })
  it('nom retouché à la main : jamais écrasé, ni vidé', () => {
    expect(nextAutoTitle({ title: 'Lancement été', lastAuto: 'CAROUSEL ALICE', auto: 'POP UP ALICE' }).title).toBeNull()
    expect(nextAutoTitle({ title: 'Lancement été', lastAuto: 'CAROUSEL ALICE', auto: '' }).title).toBeNull()
  })
})
