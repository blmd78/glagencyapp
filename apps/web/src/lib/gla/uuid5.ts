import { createHash } from 'node:crypto'

/**
 * UUID v5 déterministe (RFC 4122 §4.3) — sha1(namespace ‖ name), version 5, variante RFC.
 * Node n'en a pas de natif et aucune dépendance ne le vaut : douze lignes de sha1 et deux masques.
 *
 * POURQUOI un UUID DÉTERMINISTE plutôt qu'un `gen_random_uuid()` : la clé primaire devient la clé
 * d'idempotence. `on conflict (id) do nothing` couvre sessions, threads ET messages sans une seule
 * requête de lecture préalable — et une resynchronisation ne peut pas doubler une ligne.
 *
 * Rejouer un import sans cette idempotence DOUBLERAIT `attempts` dans `training_case_bests` et
 * fausserait `active_days` : un doublon n'est pas neutre.
 *
 * `sessions.id` GLA est une bonne source : texte de 20 caractères (7 vieilles lignes en 14),
 * UNIQUE sur les 17 259, jamais nul, zéro doublon.
 */

/**
 * Espace de noms de la reprise GLA. UUID v4 tiré UNE fois et FIGÉ : le changer réattribuerait tous
 * les identifiants, ferait échouer `on conflict (id) do nothing` et dupliquerait chaque import
 * précédent. Ne jamais le modifier.
 */
export const NS_GLA = '3f2b1c8e-5a47-4d9e-b6c1-0e7a9d4f8b12'

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** UUID v5 de `name` dans l'espace `namespace` (par défaut celui de la reprise GLA). */
export function uuidv5(name: string, namespace: string = NS_GLA): string {
  const ns = hexToBytes(namespace)
  const nameBytes = new TextEncoder().encode(name)
  const buf = new Uint8Array(ns.length + nameBytes.length)
  buf.set(ns, 0)
  buf.set(nameBytes, ns.length)
  const h = createHash('sha1').update(buf).digest()
  const b = new Uint8Array(h.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50 // version 5
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Les trois clés de l'import, dérivées du SEUL identifiant de session GLA. */
export const glaSessionId = (glaId: string) => uuidv5(`gla:session:${glaId}`)
export const glaThreadId = (glaId: string, position: number) => uuidv5(`gla:session:${glaId}:t${position}`)
export const glaMessageId = (glaId: string, position: number, index: number) =>
  uuidv5(`gla:session:${glaId}:t${position}:m${index}`)
