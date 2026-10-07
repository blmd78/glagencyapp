import { normalizeDraft, parseScriptDraft, validateScriptDraft, type ScriptDraft } from '@glagency/core'
import { describeFailure, type Cleanup } from '@glagency/scripts'
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
