import { describe, expect, it } from 'vitest'
import { attachFromLibrary, mediaLabel, sameCollectionName } from './media-match'
import type { DraftMessage, ScriptDraft } from './script-draft'

const msg = (title: string, over: Partial<DraftMessage> = {}): DraftMessage => ({
  type: 'message',
  title,
  content: title,
  price: 0,
  media: [],
  pendingMedia: null,
  chainDelays: [],
  ...over,
})
const draft = (items: ScriptDraft['items']): ScriptDraft => ({ name: 'Script-Chambre 2 🤍', description: '', isSequence: true, items })

describe('mediaLabel', () => {
  it('le libellé du script = ce qui précède le tiret (le titre à donner au média dans MyM)', () => {
    expect(mediaLabel('PPV 1 – 3 photos')).toBe('PPV 1')
    expect(mediaLabel('PHOTO 2 - tenue de révision')).toBe('PHOTO 2')
    expect(mediaLabel('VIDÉO 3 — sous la douche')).toBe('VIDÉO 3')
    expect(mediaLabel('VOCAL 1 – fais vite')).toBe('VOCAL 1')
  })
  it('pictogramme de tête ignoré ; un tiret long l’emporte sur un tiret court (« PPV 1 - BIS – … »)', () => {
    expect(mediaLabel('🖼️ PHOTO 2 – tenue')).toBe('PHOTO 2')
    expect(mediaLabel('PPV 1 - BIS – 3 photos')).toBe('PPV 1 - BIS')
  })
})

describe('sameCollectionName', () => {
  it('collection du même nom que le script : casse, accents, espaces, caractères invisibles et « (1) » ignorés', () => {
    expect(sameCollectionName('Script-Chambre 2 🤍​ (1)', 'Script-Chambre 2 🤍')).toBe(true)
    expect(sameCollectionName('Script 🤍️', 'Script 🤍')).toBe(true)
    expect(sameCollectionName('Script découverte (KYC) · Lucie', 'script decouverte (kyc) · lucie')).toBe(true)
    expect(sameCollectionName('Script-Chambre 2 🤍', 'Script-Chambre 🤍')).toBe(false)
    expect(sameCollectionName('Script-Chambre 2 🤍', 'Pack 2')).toBe(false)
  })
})

describe('attachFromLibrary', () => {
  const lib = [
    { id: '11', type: 'photo', title: 'PHOTO 1' },
    { id: '21', type: 'photo', title: 'ppv 1' },
    { id: '22', type: 'video', title: 'PPV 1' },
    { id: '31', type: 'audio', title: 'VOCAL 1' },
    { id: '41', type: 'photo', title: 'PHOTO 4' },
    { id: '42', type: 'photo', title: 'PHOTO 4' },
  ]
  it('rattache les médias au titre identique (pack = même titre), pose le prix du PPV, garde la description dans le titre', () => {
    const r = attachFromLibrary(
      draft([
        msg('#1', { pendingMedia: { description: 'PHOTO 1 – tenue', price: 0 } }),
        msg('#2', { pendingMedia: { description: 'PPV 1 – 2 médias', price: 12 } }),
        msg('#3', { content: '.', pendingMedia: { description: 'VOCAL 1 – fais vite', price: 0 } }),
      ]),
      lib,
    )
    expect(r.attached).toBe(3)
    expect(r.pending).toBe(0)
    const [a, b, c] = r.draft.items as DraftMessage[]
    expect(a).toMatchObject({ title: '#1 · 🖼️ PHOTO 1 – tenue', media: ['11'], price: 0, pendingMedia: null })
    expect(b).toMatchObject({ title: '#2 · 🖼️ PPV 1 – 2 médias', media: ['21', '22'], price: 12, pendingMedia: null })
    expect(c).toMatchObject({ media: ['31'], pendingMedia: null })
  })

  it('jamais un média deviné : titre absent, vocal mêlé, plus de 5, type inconnu, vocal payant → reste « à rattacher »', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `9${i}`, type: 'photo', title: 'PACK 6' }))
    const r = attachFromLibrary(
      draft([
        msg('#1', { pendingMedia: { description: 'PHOTO 9 – inconnue', price: 0 } }),
        msg('#2', { pendingMedia: { description: 'PACK 6 – 6 photos', price: 20 } }),
        msg('#3', { pendingMedia: { description: 'VOCAL 2 – mêlé', price: 0 } }),
        msg('#4', { pendingMedia: { description: 'STORY 1 – lien', price: 0 } }),
        msg('#5', { pendingMedia: { description: 'VOCAL 1 – payant', price: 10 } }),
      ]),
      [
        ...lib,
        ...many,
        { id: '61', type: 'audio', title: 'VOCAL 2' },
        { id: '62', type: 'photo', title: 'VOCAL 2' },
        { id: '71', type: 'gif', title: 'STORY 1' },
      ],
    )
    expect(r.attached).toBe(0)
    expect(r.pending).toBe(5)
    expect((r.draft.items as DraftMessage[]).every((m) => m.pendingMedia && m.media.length === 0)).toBe(true)
  })

  it('un libellé qui couvre deux médias DIFFÉRENTS du script, ou sans numéro, reste « à rattacher »', () => {
    const r = attachFromLibrary(
      draft([
        {
          type: 'branch',
          label: 'Libre ?',
          paths: [
            { label: 'Oui', color: 'green', messages: [msg('#3a', { pendingMedia: { description: 'PHOTO 1 – tenue', price: 0 } })] },
            { label: 'Non', color: 'red', messages: [msg('#3b', { pendingMedia: { description: 'PHOTO 1 – lingerie', price: 0 } })] },
          ],
        },
        msg('#4', { pendingMedia: { description: 'PHOTO – selfie', price: 0 } }),
      ]),
      [...lib, { id: '81', type: 'photo', title: 'PHOTO' }],
    )
    expect(r.attached).toBe(0)
    expect(r.pending).toBe(3)
  })

  it('le même média repris ailleurs (même description) est rattaché partout ; chemins compris ; un message déjà muni n’est pas touché', () => {
    const r = attachFromLibrary(
      draft([
        msg('#0', { media: ['77'] }),
        msg('#1', { pendingMedia: { description: 'PHOTO 4 – duo', price: 0 } }),
        {
          type: 'branch',
          label: 'Libre ?',
          paths: [{ label: 'Oui', color: 'green', messages: [msg('#3', { pendingMedia: { description: 'PHOTO 4 – duo', price: 0 } })] }],
        },
      ]),
      lib,
    )
    expect(r.attached).toBe(2)
    const branch = r.draft.items[2] as Extract<ScriptDraft['items'][number], { type: 'branch' }>
    expect(branch.paths[0]!.messages[0]).toMatchObject({ media: ['41', '42'], pendingMedia: null })
    expect(r.draft.items[0]).toMatchObject({ media: ['77'] })
  })
})
