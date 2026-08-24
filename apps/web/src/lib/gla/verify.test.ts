import { describe, expect, it } from 'vitest'
import { NS_GLA, glaMessageId, glaSessionId, glaThreadId, uuidv5 } from './uuid5'
import { glaPasswordHash, verifyGlaPassword } from './verify'

/**
 * Vecteurs de test SYNTHÉTIQUES (aucun sel, aucune empreinte, aucun mot de passe de la base GLA
 * n'apparaît ici). L'algorithme, lui, a été confronté à la source : sur les 248 comptes de GLA,
 * `encode(sha256((salt || ':' || pw_plain)::bytea),'hex') = pw_hash` rend 248/248.
 */
const SALT = '0123456789abcdef'
const HASH = 'bc6bdf491da9dc0b6b8f5209c5ee8dfed87318290315a4431ce99d9939287209' // sha256('0123456789abcdef:motdepasse')

describe('glaPasswordHash — l’algorithme exact de GLA (serveur.py:579-580)', () => {
  it('hache sha256(salt + ":" + password) en UTF-8, une seule itération', () => {
    expect(glaPasswordHash(SALT, 'motdepasse')).toBe(HASH)
  })

  it('encode en UTF-8 (accents et non-ASCII passent par le même chemin que côté Python)', () => {
    expect(glaPasswordHash('a1b2c3d4e5f60718', 'Été2026 ✓')).toBe(
      'a7e927aed6d5ef0480942c6ff1cc557973f99844e8834a15fb813225e143912b',
    )
  })

  // Le séparateur est une simple concaténation, donc (salt='ab', pw='c:d') et (salt='ab:c', pw='d')
  // donnent la MÊME empreinte. C'est une faiblesse de GLA, pas de notre code : on la reproduit
  // fidèlement (les sels réels font 16 hex, elle est inatteignable en pratique). Le test l'épingle
  // pour qu'un futur « durcissement » du séparateur ne casse pas la vérification de 248 comptes.
  it('concatène `salt + ":" + password` sans échappement — fidèle à GLA, ambiguïté comprise', () => {
    expect(glaPasswordHash('ab', 'c:d')).toBe(glaPasswordHash('ab:c', 'd'))
    expect(glaPasswordHash('ab', 'cd')).not.toBe(glaPasswordHash('abcd', ''))
  })
})

describe('verifyGlaPassword', () => {
  const account = { login: 'Exemple', salt: SALT, pwHash: HASH }

  it('accepte le bon mot de passe', () => {
    expect(verifyGlaPassword(account, 'motdepasse')).toBe(true)
  })

  it('refuse un mauvais mot de passe', () => {
    expect(verifyGlaPassword(account, 'motdepass')).toBe(false)
    expect(verifyGlaPassword(account, '')).toBe(false)
  })

  it('accepte une empreinte stockée en majuscules (comparaison sur les octets, pas sur le texte)', () => {
    expect(verifyGlaPassword({ ...account, pwHash: HASH.toUpperCase() }, 'motdepasse')).toBe(true)
  })

  // Garde défensive : `salt` et `pw_hash` sont `text` NULLABLES au schéma GLA (db.py:127-129).
  // Jamais observé (0/248) — doit rendre `false`, exactement comme un mauvais mot de passe.
  it('refuse un compte au sel ou à l’empreinte absents, sans lever', () => {
    expect(verifyGlaPassword({ login: 'x', salt: null, pwHash: HASH }, 'motdepasse')).toBe(false)
    expect(verifyGlaPassword({ login: 'x', salt: SALT, pwHash: null }, 'motdepasse')).toBe(false)
    expect(verifyGlaPassword({ login: 'x', salt: SALT, pwHash: 'pas-du-hex' }, 'motdepasse')).toBe(false)
  })

  // Le compte inexistant fait TOUT DE MÊME le sha256 (sel factice de la même forme) : sans ça, le
  // temps de réponse dit à l'attaquant quels logins existent, et ruine le message générique.
  it('refuse un compte absent — et un mot de passe vide ne peut pas « tomber » sur l’empreinte factice', () => {
    expect(verifyGlaPassword(null, 'motdepasse')).toBe(false)
    expect(verifyGlaPassword(null, '')).toBe(false)
  })
})

describe('uuidv5 — la clé d’idempotence de l’import', () => {
  // Vecteur canonique de la RFC 4122 : uuidv5('www.example.com', namespace DNS).
  it('est conforme à la RFC 4122 §4.3', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    )
  })

  it('pose bien la version 5 et la variante RFC', () => {
    const id = uuidv5('gla:session:s1786184075716708035')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('est stable et distinct par sorte de ligne — c’est ce qui rend la resynchronisation gratuite', () => {
    const gla = 's1786184075716708035'
    expect(glaSessionId(gla)).toBe(glaSessionId(gla))
    expect(new Set([glaSessionId(gla), glaThreadId(gla, 0), glaMessageId(gla, 0, 0)]).size).toBe(3)
    expect(glaThreadId(gla, 0)).not.toBe(glaThreadId(gla, 1))
    expect(glaMessageId(gla, 0, 1)).not.toBe(glaMessageId(gla, 1, 0))
  })

  // Le changer réattribuerait TOUS les identifiants et dupliquerait chaque import précédent.
  it('épingle l’espace de noms de la reprise', () => {
    expect(NS_GLA).toBe('3f2b1c8e-5a47-4d9e-b6c1-0e7a9d4f8b12')
  })
})
