import { describe, it, expect } from 'vitest'
import { typeBadge } from '@/lib/type-badge'
import { botTone, deltaTone, flagTone, platformBadge } from './tones'

describe('flagTone', () => {
  it('rouge pour ce qui perd du trafic, ambre pour ce qui le gâche', () => {
    expect(flagTone('chute')).toBe('danger')
    expect(flagTone('eteint')).toBe('danger')
    expect(flagTone('clic-faible')).toBe('warning')
    expect(flagTone('bots')).toBe('warning')
  })
})

describe('deltaTone', () => {
  it('vert en hausse, rouge en baisse, neutre sinon', () => {
    expect(deltaTone(12)).toBe('positive')
    expect(deltaTone(-5)).toBe('danger')
    expect(deltaTone(0)).toBeNull()
    expect(deltaTone(null)).toBeNull()
  })
})

describe('botTone', () => {
  it('ambre au-dessus de 10 %, rouge au-dessus du seuil du badge (20 %)', () => {
    expect(botTone(0.05)).toBeNull()
    expect(botTone(0.1)).toBeNull()
    expect(botTone(0.15)).toBe('warning')
    expect(botTone(0.2)).toBe('warning')
    expect(botTone(0.33)).toBe('danger')
    expect(botTone(null)).toBeNull()
  })
})

describe('platformBadge', () => {
  it('reprend les couleurs de réseau de Liens tracking (X = twitter, Instagram, Snapchat)', () => {
    expect(platformBadge('x')).toBe(typeBadge('twitter'))
    expect(platformBadge('instagram')).toBe(typeBadge('instagram'))
    expect(platformBadge('snapchat')).toBe(typeBadge('snapchat'))
  })
  it('Threads et Autre : le gris des types sans couleur', () => {
    expect(platformBadge('threads')).toBe(typeBadge('autre'))
    expect(platformBadge('autre')).toBe(typeBadge('autre'))
  })
})
