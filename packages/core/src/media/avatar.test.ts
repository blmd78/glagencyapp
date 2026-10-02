import { describe, it, expect } from 'vitest'
import { AVATAR_MAX_BYTES, avatarOutcome, avatarTargets, sniffImageType, type AvatarCreator } from './avatar'

const bytes = (...b: number[]) => new Uint8Array(b)
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)
const HTML = new TextEncoder().encode('<!DOCTYPE html><html>')

describe('sniffImageType', () => {
  it('reconnaît WebP, JPEG et PNG sur leurs premiers octets', () => {
    expect(sniffImageType(WEBP)).toBe('image/webp')
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(PNG)).toBe('image/png')
  })
  it('refuse le reste, y compris un fichier vide ou une page HTML', () => {
    expect(sniffImageType(HTML)).toBeNull()
    expect(sniffImageType(bytes())).toBeNull()
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46))).toBeNull()
  })
})

describe('avatarOutcome', () => {
  it('une redirection vers /login = session expirée', () => {
    expect(avatarOutcome({ status: 302, location: 'https://mypuls.app/login', bytes: bytes() })).toEqual({ kind: 'session' })
  })
  it('une autre redirection, un 404 ou un 500 : modèle sautée, avec la raison', () => {
    expect(avatarOutcome({ status: 302, location: 'https://mypuls.app/autre', bytes: bytes() })).toEqual({
      kind: 'invalid',
      reason: 'redirection 302',
    })
    expect(avatarOutcome({ status: 404, location: null, bytes: bytes() })).toEqual({ kind: 'invalid', reason: 'HTTP 404' })
  })
  it('un 200 qui n’est pas une image est refusé', () => {
    expect(avatarOutcome({ status: 200, location: null, bytes: HTML })).toEqual({ kind: 'invalid', reason: 'pas une image' })
  })
  it('le type vient des octets, pas de l’en-tête : WebP → .webp', () => {
    expect(avatarOutcome({ status: 200, location: null, bytes: WEBP })).toEqual({ kind: 'image', mime: 'image/webp', ext: 'webp' })
    expect(avatarOutcome({ status: 200, location: null, bytes: JPEG })).toEqual({ kind: 'image', mime: 'image/jpeg', ext: 'jpg' })
  })
  it('une image de plus de 1 Mo est refusée avant l’envoi', () => {
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1)
    big.set(JPEG)
    expect(avatarOutcome({ status: 200, location: null, bytes: big })).toEqual({ kind: 'invalid', reason: 'image de plus de 1 Mo' })
  })
})

describe('avatarTargets', () => {
  const c = (over: Partial<AvatarCreator>): AvatarCreator => ({ id: 'x', name: 'X', mypulsCreatorId: '1', avatarPath: null, ...over })
  const all = [
    c({ id: 'a', name: 'Alice' }),
    c({ id: 'b', name: 'Béa', avatarPath: 'b.webp' }),
    c({ id: 'z', name: 'Sans id', mypulsCreatorId: null }),
  ]
  it('seules les modèles sans photo, et jamais une modèle sans id MyPuls', () => {
    expect(avatarTargets(all).map((x) => x.id)).toEqual(['a'])
  })
  it('--force reprend toutes celles qui ont un id MyPuls', () => {
    expect(avatarTargets(all, true).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
