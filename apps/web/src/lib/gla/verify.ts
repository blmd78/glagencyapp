import { createHash, timingSafeEqual } from 'node:crypto'
import type { GlaAccount } from './types'

/**
 * Vérification du mot de passe d'un compte Good Luck Agency. Module NEUTRE (pas de `'use server'`) :
 * une fonction qui manipule `salt` / `pw_hash` ne doit jamais devenir un point d'entrée HTTP.
 *
 * L'algorithme est celui de GLA, à l'identique — `serveur.py:579-580` :
 *   `hashlib.sha256((salt + ":" + (pw or "")).encode("utf-8")).hexdigest()`
 * Séparateur `:` littéral, UNE seule itération, pas de HMAC, pas de KDF, pas de poivre, aucun repli
 * legacy (`hash_pw` n'apparaît qu'aux lignes 579, 915, 1101, 1133, 1280). Vérifié sur 235/235
 * comptes, sel de 16 hex et hash de 64 hex sur 235/235.
 *
 * Le mot de passe saisi n'entre dans AUCUN log, aucun breadcrumb, aucun objet capturé : ne jamais
 * l'ajouter au contexte Sentry, ne jamais le `console.log`, ne jamais le mettre dans le message
 * d'une `BusinessError`.
 */

const HEX64 = /^[0-9a-f]{64}$/i
/** Sel factice de la MÊME forme que les vrais (16 hex) : le coût du calcul doit être identique. */
const DUMMY_SALT = '0123456789abcdef'
const DUMMY_HASH = '0'.repeat(64)

/** `sha256(salt + ':' + password)` en hexadécimal — l'empreinte telle que GLA la stocke. */
export function glaPasswordHash(salt: string, password: string): string {
  return createHash('sha256').update(`${salt}:${password}`, 'utf8').digest('hex')
}

/**
 * `true` seulement si le compte existe, porte un sel et une empreinte bien formés, et que le mot de
 * passe correspond.
 *
 * DEUX propriétés à ne pas casser :
 *  - **Coût constant** : le sha256 est calculé MÊME quand le compte n'existe pas (sel factice).
 *    Sans ça, le temps de réponse dit à l'attaquant quels logins existent — et ruine tout le travail
 *    fait sur le message générique « Identifiants introuvables. ».
 *  - **Comparaison à temps constant** : `timingSafeEqual` sur les buffers hex décodés, jamais
 *    `!==`. GLA compare en clair (`serveur.py:915`) ; aucune raison de reproduire la faiblesse.
 *
 * Garde défensive : `salt` et `pw_hash` sont `text` NULLABLES au schéma GLA (db.py:127-129).
 * Le cas n'existe pas aujourd'hui (0/235) — il rend `false`, comme un mauvais mot de passe.
 */
export function verifyGlaPassword(account: GlaAccount | null, password: string): boolean {
  const usable = account != null && !!account.salt && !!account.pwHash && HEX64.test(account.pwHash)
  const salt = usable ? (account.salt as string) : DUMMY_SALT
  const stored = usable ? (account.pwHash as string).toLowerCase() : DUMMY_HASH
  const candidate = glaPasswordHash(salt, password)
  // Les deux buffers font toujours 32 octets (hex de 64) : `timingSafeEqual` ne peut pas lever.
  const equal = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(stored, 'hex'))
  // `usable` est évalué APRÈS le calcul, jamais en court-circuit devant lui : un `return usable && …`
  // sauterait le sha256 sur un login inexistant et rétablirait l'oracle de temps.
  return equal && usable
}
