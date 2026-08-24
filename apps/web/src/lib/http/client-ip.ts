import { headers } from 'next/headers'

/**
 * IP de l'appelant, pour les rate-limits d'entrée (test de recrutement, réclamation d'un ancien
 * compte Good Luck Agency). Vercel pose `x-real-ip` (valeur unique) et `x-forwarded-for` (liste)
 * sur chaque requête entrante ; en local, sans proxy, aucun des deux n'existe → `null`, et les
 * gardes qui dépendent de l'IP se neutralisent d'elles-mêmes (on ne bloque personne sur une IP
 * inconnue — patron `recruit_start_attempt`, 0115:57-59).
 *
 * Même avec l'en-tête le plus fiable, cette valeur reste indicative : elle borne un abus
 * opportuniste, pas un attaquant déterminé.
 *
 * VIT ICI ET PAS DANS UNE FEATURE : `apps/web/eslint.config.mjs` génère une zone d'interdiction
 * par feature (`{ target: './src/features/<f>', from: './src/features', except: ['./<f>'] }`) —
 * `features/training-legacy/actions.ts` ne pouvait pas l'importer de `features/recruit-test/`.
 * La logique n'a pas bougé d'un caractère lors du déménagement.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers()
  // Valeur unique posée par la plateforme d'abord (`x-real-ip`) : la liste `x-forwarded-for` peut
  // être concaténée avec des valeurs ENTRANTES forgées par le client, dont la première position.
  // XFF ne sert que de repli (autre proxy en amont), et on n'en garde que la première entrée.
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}
