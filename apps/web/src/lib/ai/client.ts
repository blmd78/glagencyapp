import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { isAiOverloaded } from './errors'

/**
 * Client Anthropic — SERVEUR uniquement (`server-only` : un import côté client casse au build).
 * `ANTHROPIC_API_KEY` lue par le SDK depuis l'env. Modèles figés ici : fan = Haiku 4.5 (réponses
 * courtes, ~0,03 $ la session solo), notation = Sonnet 5 (jugement, un appel structuré).
 * Coût/latence tracés par appel dans training_ai_calls (lib/ai/log.ts).
 */
export const FAN_MODEL = 'claude-haiku-4-5'
export const SCORE_MODEL = 'claude-sonnet-5'

/**
 * Modèle de SECOURS quand celui du fan est saturé. La capacité se sature PAR MODÈLE : le 2026-09-02
 * (14h28-14h45 Paris), Haiku 4.5 renvoyait `529 overloaded_error` sans interruption pendant que le
 * reste de l'API répondait. Sonnet 5 est déjà le modèle de notation du projet — aucun accès neuf à
 * ouvrir, et un fan un cran au-dessus reste jouable. Il coûte 2× le prix d'un appel fan
 * (~0,006 $ contre ~0,003 $) : sans objet tant que ça ne sert que pendant les vagues.
 */
export const FAN_FALLBACK_MODEL = SCORE_MODEL

/**
 * Réglages du fan face à une saturation. Le SDK réessaie déjà les 5xx tout seul (`x-should-retry:
 * true` sur les 529), backoff 0,5 s puis 1 s — mais une vague dure des MINUTES : le 2026-09-02, les
 * 3 tentatives échouaient à chaque envoi, 17 minutes durant. Élargir la fenêtre de retry n'aurait
 * rien sauvé, seulement fait patienter le chatteur plus longtemps avant le même échec. On garde donc
 * les 2 réessais du SDK (~2,5 s en tout) et on va vite au repli, qui lui contourne vraiment.
 *
 * Le timeout passe de 20 s à 8 s POUR LE FAN : la réponse arrive en 1,4 s en moyenne, 2,0 s au p95
 * (relevé sur `training_ai_calls`). 8 s laisse quatre fois la marge du p95 et borne le pire cas —
 * sans ça, quatre tentatives qui pendent enfermaient le chatteur une minute et demie devant un
 * écran figé. La notation (`score.ts`) garde son propre timeout de 60 s : elle réfléchit, elle.
 */
const FAN_REQUEST = { maxRetries: 2, timeout: 8_000 }
const FALLBACK_REQUEST = { maxRetries: 1, timeout: 10_000 }

let client: Anthropic | null = null
export function anthropic(): Anthropic {
  // Fail-fast, comme `createAdminClient` : sans clé, le SDK part quand même et échoue en 401 après
  // deux réessais — le chatter voyait « le fan n'a pas répondu » au lieu d'une erreur de config.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY manquante (cf. .env.example à la racine — à poser dans apps/web/.env.local et sur Vercel)')
  }
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 20_000 })
  return client
}

/**
 * Un appel de fan TENU face à la saturation : même requête, modèle de secours.
 *
 * `attempt` reçoit le modèle et les options de requête à passer au SDK — c'est l'appelant qui monte
 * sa requête (le fan de l'entraînement et le bot du recrutement n'ont ni le même prompt ni le même
 * plafond de tokens), cette fonction ne décide que du QUAND on bascule.
 *
 * Trois règles, dans cet ordre :
 *  - une panne qui n'est PAS une saturation remonte telle quelle : rejouer une requête invalide ou
 *    une clé révoquée sur un second modèle, c'est payer deux fois le même échec ;
 *  - si le repli échoue à son tour, c'est l'erreur D'ORIGINE qu'on relance — la cause du tour perdu
 *    est la saturation du modèle principal, et c'est elle qui doit s'afficher et partir en alerte ;
 *  - le repli est tracé en `console.warn` : `training_ai_calls` enregistre le modèle RENDU par
 *    l'API, donc la bascule se voit aussi dans les coûts, mais après coup seulement.
 */
export async function withOverloadFallback<T>(
  attempt: (model: string, request: { maxRetries: number; timeout: number }) => Promise<T>,
  models: { model: string; fallbackModel: string },
): Promise<T> {
  try {
    return await attempt(models.model, FAN_REQUEST)
  } catch (err) {
    if (!isAiOverloaded(err)) throw err
    console.warn(`[ai] ${models.model} saturé — repli sur ${models.fallbackModel}`)
    try {
      return await attempt(models.fallbackModel, FALLBACK_REQUEST)
    } catch (fallbackErr) {
      console.error('[ai] le modèle de repli est saturé lui aussi', fallbackErr)
      throw err
    }
  }
}
