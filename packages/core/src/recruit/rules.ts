/** Test de recrutement (transposition de GLA) — règles PURES, testées, partagées par apps/web. */

export type QiVariant = { q: string; opts: string[]; a: number }
export type QiSlot = { slot: string; variants: QiVariant[] }
/** Question envoyée au client : jamais la bonne réponse (`a`). */
export type QiQuestion = { slot: string; q: string; opts: string[] }

export type RecruitConfig = {
  botMessages: number
  qiTimer: number
  frappeMin: number
  connexionMin: number
  qiMin: number
  globalThreshold: number
}

/** Défauts GLA (`finishCandidate` / config par défaut du test). */
export const RECRUIT_DEFAULTS: RecruitConfig = {
  botMessages: 14,
  qiTimer: 30,
  frappeMin: 30,
  connexionMin: 10,
  qiMin: 3,
  globalThreshold: 70,
}

/**
 * Tire 1 variante par emplacement (`rand(n)` doit rendre un entier dans [0, n), côté serveur :
 * crypto.randomInt). Retourne les questions SANS la bonne réponse + la clé de correction séparée
 * (même ordre que `bank`) — la banque ne descend jamais au client.
 */
export function pickQiQuestions(
  bank: QiSlot[],
  rand: (maxExclusive: number) => number,
): { questions: QiQuestion[]; answerKey: number[] } {
  const questions: QiQuestion[] = []
  const answerKey: number[] = []
  for (const slot of bank) {
    const idx = rand(slot.variants.length)
    // Bornes garanties par construction (`idx` dans [0, variants.length)).
    const variant = slot.variants[idx] as QiVariant
    questions.push({ slot: slot.slot, q: variant.q, opts: variant.opts })
    answerKey.push(variant.a)
  }
  return { questions, answerKey }
}

/** Corrige : `answers[i] === answerKey[i]` (null/undefined/hors bornes = faux). */
export function gradeQi(answerKey: number[], answers: (number | null)[]): number {
  let score = 0
  for (let i = 0; i < answerKey.length; i++) {
    if (answers[i] === answerKey[i]) score++
  }
  return score
}

export type Verdict = {
  global: number
  passed: boolean
  refusalStep: string | null
  refusalReason: string | null
}

export type VerdictInput = {
  qi: number
  wpm: number
  mbps: number
  bot: { total: number; orthographe: number; coherence: number; relance: number; vente: number }
  config: RecruitConfig
}

/**
 * Verdict GLA (`finishCandidate`) : gates cachés (frappe → connexion → QI) puis
 * `global = round(qi/5*30 + bot.total/100*70)` contre le seuil. La raison de refus est
 * qualitative (jamais les chiffres) : le nom du premier gate en échec, ou — si tout passe sauf
 * le global — l'axe du bot le plus faible (départage GLA : orthographe → vente → relance →
 * défaut cohérence). Réussite → `refusalStep`/`refusalReason` null.
 */
export function computeVerdict(i: VerdictInput): Verdict {
  const { qi, wpm, mbps, bot, config } = i
  const gateFrappe = wpm >= config.frappeMin
  const gateConn = mbps >= config.connexionMin
  const qiOk = qi >= config.qiMin
  const global = Math.round((qi / 5) * 30 + (bot.total / 100) * 70)
  const passed = gateFrappe && gateConn && qiOk && global >= config.globalThreshold

  if (passed) return { global, passed, refusalStep: null, refusalReason: null }

  if (!gateFrappe) {
    return {
      global,
      passed,
      refusalStep: 'Vitesse de frappe',
      refusalReason: "ta vitesse de frappe est en dessous de ce qu'on recherche pour le poste",
    }
  }
  if (!gateConn) {
    return {
      global,
      passed,
      refusalStep: 'Connexion internet',
      refusalReason: 'ta connexion internet est trop lente pour assurer le chat',
    }
  }
  if (!qiOk) {
    return {
      global,
      passed,
      refusalStep: 'Test de logique',
      refusalReason: "tes réponses au test de logique n'étaient pas assez solides",
    }
  }

  // Tous les gates passent, seul le global est sous le seuil : on nomme l'axe le plus faible.
  const low = Math.min(bot.orthographe, bot.vente, bot.relance, bot.coherence)
  let refusalReason: string
  if (low === bot.orthographe) refusalReason = 'ta qualité d\'écriture pouvait être plus soignée'
  else if (low === bot.vente) refusalReason = "tu n'as pas assez su orienter la discussion vers une vente"
  else if (low === bot.relance) refusalReason = 'tu n\'as pas assez relancé pour garder le client accroché'
  else refusalReason = 'la conversation manquait de fluidité et de naturel'

  return { global, passed, refusalStep: 'Conversation avec le client', refusalReason }
}
