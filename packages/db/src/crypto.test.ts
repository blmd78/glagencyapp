import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { encryptToken, decryptToken } from './crypto.ts'

process.env.UNCOVE_TOKEN_SECRET = randomBytes(32).toString('base64')

test('round-trip : decrypt(encrypt(x)) === x et le stocké est chiffré', () => {
  const enc = encryptToken('user_token_abc.def.ghi')
  assert.notEqual(enc, 'user_token_abc.def.ghi')
  assert.match(enc, /^v1:/)
  assert.equal(decryptToken(enc), 'user_token_abc.def.ghi')
})

test('decryptToken renvoie null si la clé est absente (état dégradé, pas un crash)', () => {
  const enc = encryptToken('x')
  const saved = process.env.UNCOVE_TOKEN_SECRET
  delete process.env.UNCOVE_TOKEN_SECRET
  assert.equal(decryptToken(enc), null)
  process.env.UNCOVE_TOKEN_SECRET = saved
})

test('encryptToken lève si la clé est absente', () => {
  const saved = process.env.UNCOVE_TOKEN_SECRET
  delete process.env.UNCOVE_TOKEN_SECRET
  assert.throws(() => encryptToken('x'))
  process.env.UNCOVE_TOKEN_SECRET = saved
})
