import { normalizeDraft, parseScriptDraft, validateScriptDraft, type ScriptDraft } from '@glagency/core'
import { NotionError, describeFailure, type Cleanup } from '@glagency/scripts'
import { BusinessError } from '@/lib/actions'
import type { ImportStatus } from './rules'

/**
 * Règles côté SERVEUR de l'envoi — pures, testées sans mock. Hors de `rules.ts`, que des composants
 * client importent : `@glagency/scripts` embarque le SDK Anthropic.
 */

/**
 * Revérifie le brouillon RELU en base juste avant l'envoi : la colonne `errors` ne fait pas foi
 * seule (la base verrouille le rapport depuis 0186, mais la vérification complète avant écriture
 * reste la garantie de la spec, § 6). Mêmes règles que la préparation.
 */
export function checkDraftForSend(raw: unknown): { ok: true; draft: ScriptDraft } | { ok: false; reason: string } {
  let parsed: ScriptDraft
  try {
    parsed = parseScriptDraft(raw)
  } catch {
    return { ok: false, reason: 'Brouillon illisible : prépare le script à nouveau.' }
  }
  const { draft } = normalizeDraft(parsed)
  const errors = validateScriptDraft(draft)
  if (errors.length > 0) {
    const n = errors.length
    return { ok: false, reason: `Le brouillon ne passe plus la vérification (${n} erreur${n > 1 ? 's' : ''}) : prépare le script à nouveau.` }
  }
  return { ok: true, draft }
}

/**
 * Erreur de lecture Notion → message pour le manager (issue attendue), ou `null` : erreur technique,
 * à laisser remonter (Sentry + message générique). Branche sur le statut, jamais sur le texte.
 */
export function notionReadMessage(e: unknown): string | null {
  if (!(e instanceof NotionError)) return null
  if (e.status === 403 || e.status === 404) return 'Page Notion introuvable, ou pas partagée avec le CRM (Partager → Connexions → GL Agency CRM).'
  if (e.status === 401) return 'Connexion Notion expirée : un admin doit reconnecter Notion.'
  if (e.status === 429) return 'Notion limite le débit : réessaie dans une minute.'
  return null
}

export interface SendLock {
  acquire(holder: string): Promise<boolean>
  release(holder: string): Promise<void>
}

export const SEND_BUSY = 'Un autre script est en cours d’envoi vers MyPuls (un seul à la fois) : réessaie dans une à deux minutes.'

/**
 * Un seul envoi à la fois : tous partagent la session MyPuls « scripts », et `switchCreator` y change
 * la modèle COURANTE — deux envois simultanés déposeraient un script chez la mauvaise modèle. Le
 * verrou (0187) expire seul au-delà de la durée maximale d'une requête.
 */
export async function withSendLock<T>(lock: SendLock, holder: string, fn: () => Promise<T>): Promise<T> {
  if (!(await lock.acquire(holder))) throw new BusinessError(SEND_BUSY)
  try {
    return await fn()
  } finally {
    await lock.release(holder)
  }
}

/**
 * Message d'échec RECONSTRUIT depuis la ligne enregistrée (étape, erreur, nettoyage réellement
 * obtenu) : il survit au rechargement et à une réponse d'action perdue — un « TOUJOURS ACTIF » ne
 * doit jamais disparaître de l'écran. `null` quand il n'y a rien à signaler.
 */
export function failureText(o: {
  status: ImportStatus
  mypulsScriptId: number | null
  failedStep: string | null
  error: string | null
  cleanup: Cleanup | null
  scriptName: string
}): string | null {
  if (o.status === 'échec') {
    return describeFailure(
      { ok: false, scriptId: o.mypulsScriptId, step: o.failedStep ?? 'envoi', error: o.error ?? 'erreur inconnue', cleanup: o.cleanup },
      o.scriptName,
    )
  }
  if (o.status === 'interrompu') {
    const head = 'Envoi interrompu avant la fin (durée maximale atteinte ou connexion coupée).'
    return o.mypulsScriptId
      ? `${head} Script ${o.mypulsScriptId} créé dans MyPuls : vérifie qu’il est désactivé, puis supprime-le.`
      : `${head} Aucun script enregistré : vérifie dans le Studio.`
  }
  return null
}
