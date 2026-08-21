import { describe, expect, it } from 'vitest'
import { composerForm, mediaPriceForm, reportInput, sendInput } from './schema'

const id = '11111111-1111-4111-8111-111111111111'

describe('sendInput', () => {
  it('texte OU média', () => {
    expect(sendInput.safeParse({ threadId: id, body: 'hey', mediaPrice: null }).success).toBe(true)
    expect(sendInput.safeParse({ threadId: id, body: '', mediaPrice: 30 }).success).toBe(true)
    expect(sendInput.safeParse({ threadId: id, body: '   ', mediaPrice: null }).success).toBe(false)
    expect(sendInput.safeParse({ threadId: id, body: 'x', mediaPrice: 0 }).success).toBe(false)
  })

  it('threadId doit être un uuid, body plafonné à 1000', () => {
    expect(sendInput.safeParse({ threadId: 'nope', body: 'hey', mediaPrice: null }).success).toBe(false)
    expect(sendInput.safeParse({ threadId: id, body: 'a'.repeat(1001), mediaPrice: null }).success).toBe(false)
  })

  it('body est trimé (le message stocké ne garde pas les espaces de bord)', () => {
    const r = sendInput.safeParse({ threadId: id, body: '  salut  ', mediaPrice: null })
    expect(r.success && r.data.body).toBe('salut')
  })

  it('prix de média entier et borné (1 à 10 000 €)', () => {
    expect(sendInput.safeParse({ threadId: id, body: '', mediaPrice: 10001 }).success).toBe(false)
    expect(sendInput.safeParse({ threadId: id, body: '', mediaPrice: 12.5 }).success).toBe(false)
  })
})

describe('composerForm', () => {
  it('même règle texte OU média, sans threadId', () => {
    expect(composerForm.safeParse({ body: 'hey', mediaPrice: null }).success).toBe(true)
    expect(composerForm.safeParse({ body: '', mediaPrice: null }).success).toBe(false)
  })
})

describe('reportInput', () => {
  it('message obligatoire, 2000 caractères max', () => {
    expect(reportInput.safeParse({ sessionId: id, message: 'la note est fausse' }).success).toBe(true)
    expect(reportInput.safeParse({ sessionId: id, message: '  ' }).success).toBe(false)
    expect(reportInput.safeParse({ sessionId: id, message: 'a'.repeat(2001) }).success).toBe(false)
  })
})

describe('mediaPriceForm', () => {
  it('coerce la saisie du popover', () => {
    const r = mediaPriceForm.safeParse({ price: '30' })
    expect(r.success && r.data.price).toBe(30)
    expect(mediaPriceForm.safeParse({ price: '0' }).success).toBe(false)
  })
})
